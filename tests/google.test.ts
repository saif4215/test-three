import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actor, cleanDbPerTest } from "./helpers";
import { startFakeGoogle, type FakeGoogle } from "./stand-ins/google";

cleanDbPerTest();

let g: FakeGoogle;
beforeAll(async () => {
  g = await startFakeGoogle();
  process.env.GOOGLE_OIDC_BASE_URL = g.url;
  process.env.GOOGLE_CLIENT_ID = g.clientId;
  process.env.GOOGLE_CLIENT_SECRET = g.clientSecret;
});
afterAll(async () => {
  await g.close();
  delete process.env.GOOGLE_OIDC_BASE_URL;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

/** Plays the browser: follows the authorize link and returns the callback parameters Google would send back. */
async function browse(kind: "customer" | "admin" = "customer") {
  const { beginSignIn, readHandoff } = await import("../src/lib/google/oidc");
  const { url, cookie } = await beginSignIn(kind, "/after");
  const res = await fetch(url, { redirect: "manual" });
  const back = new URL(res.headers.get("location")!);
  const handoff = readHandoff(cookie)!;
  return { url, cookie, handoff, params: { code: back.searchParams.get("code"), state: back.searchParams.get("state"), error: back.searchParams.get("error") } };
}

describe("Google sign-in (OpenID Connect + PKCE) against a stand-in", () => {
  it("builds an authorize link with PKCE S256, state and nonce, and a signed hand-off cookie", async () => {
    const { url, handoff } = await browse();
    const u = new URL(url);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("scope")).toBe("openid email profile");
    expect(u.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/google/callback");
    expect(u.searchParams.get("state")).toBe(handoff.state);
    expect(handoff.next).toBe("/after");
  });

  it("completes a normal sign-in and returns the verified profile", async () => {
    const { completeSignIn } = await import("../src/lib/google/oidc");
    g.setUser({ sub: "abc", email: "Parent@Example.org", name: "Pat Parent", emailVerified: true });
    const { handoff, params } = await browse();
    const p = await completeSignIn(handoff, params);
    expect(p).toMatchObject({ sub: "abc", email: "parent@example.org", name: "Pat Parent" });
  });

  it("rejects an unverified email address", async () => {
    const { completeSignIn } = await import("../src/lib/google/oidc");
    g.setUser({ sub: "u1", email: "x@example.org", emailVerified: false });
    const { handoff, params } = await browse();
    await expect(completeSignIn(handoff, params)).rejects.toThrow(/confirm an email/);
  });

  it.each(["audience", "nonce", "signature", "expired"] as const)("rejects an ID token with a bad %s", async (kind) => {
    const { completeSignIn } = await import("../src/lib/google/oidc");
    g.setUser({ sub: "u2", email: "y@example.org" });
    const { handoff, params } = await browse();
    g.breakNext(kind);
    await expect(completeSignIn(handoff, params)).rejects.toThrow();
  });

  it("rejects a callback whose state doesn't match this browser", async () => {
    const { completeSignIn } = await import("../src/lib/google/oidc");
    const { handoff, params } = await browse();
    await expect(completeSignIn(handoff, { ...params, state: "forged" })).rejects.toThrow(/matched/);
  });

  it("a code can only be used once, and not with a different PKCE verifier", async () => {
    const { completeSignIn } = await import("../src/lib/google/oidc");
    g.setUser({ sub: "u3", email: "z@example.org" });
    const first = await browse();
    await completeSignIn(first.handoff, first.params);
    await expect(completeSignIn(first.handoff, first.params)).rejects.toThrow();
    const second = await browse();
    await expect(completeSignIn({ ...second.handoff, verifier: "not-the-verifier" }, second.params)).rejects.toThrow();
  });

  it("reports a cancelled sign-in distinctly", async () => {
    const { completeSignIn } = await import("../src/lib/google/oidc");
    g.setUser(null);
    const { handoff, params } = await browse();
    await expect(completeSignIn(handoff, params)).rejects.toMatchObject({ code: "google_cancelled" });
    g.setUser({ sub: "g-1", email: "shopper@example.org" });
  });

  it("refuses a hand-off cookie that was tampered with or has expired", async () => {
    const { beginSignIn, readHandoff } = await import("../src/lib/google/oidc");
    const { cookie } = await beginSignIn("admin", "/admin");
    expect(readHandoff(cookie)?.kind).toBe("admin");
    const [payload, mac] = cookie.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), kind: "customer" })).toString("base64url");
    expect(readHandoff(`${forged}.${mac}`)).toBeNull();
    expect(readHandoff(undefined)).toBeNull();
    expect(readHandoff("garbage")).toBeNull();
    const old = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), exp: Date.now() - 1 })).toString("base64url");
    expect(readHandoff(`${old}.${mac}`)).toBeNull();
  });

  it("checks the Workspace domain through both the hd claim and the address", async () => {
    const { inDomain } = await import("../src/lib/google/oidc");
    const p = { sub: "1", email: "a@school.org", name: "", hostedDomain: "school.org" };
    expect(inDomain(p, "school.org")).toBe(true);
    expect(inDomain(p, "@School.org")).toBe(true);
    expect(inDomain({ ...p, hostedDomain: null }, "school.org")).toBe(false);
    expect(inDomain({ ...p, email: "a@gmail.com" }, "school.org")).toBe(false);
  });
});

describe("Google verification gates the feature switches", () => {
  it("cannot switch on Google sign-in before a successful, real test", async () => {
    const { setFeatureFlags, FeatureError } = await import("../src/lib/settings");
    await expect(setFeatureFlags({ customer_sign_in: true }, actor)).rejects.toBeInstanceOf(FeatureError);
  });

  it("verifies with the right credentials, then allows the switch", async () => {
    const { verifyIntegration, getIntegrationStates } = await import("../src/lib/integrations");
    const { setFeatureFlags, loadEffectiveFeatures } = await import("../src/lib/settings");
    const r = await verifyIntegration("google");
    expect(r).toMatchObject({ ok: true });
    expect((await getIntegrationStates()).google.verified).toBe(true);
    await setFeatureFlags({ customer_sign_in: true, admin_google_sign_in: true }, actor);
    const f = await loadEffectiveFeatures();
    expect(f.customer_sign_in && f.admin_google_sign_in).toBe(true);
  });

  it("stops working the moment the secret changes, until verified again", async () => {
    const { verifyIntegration } = await import("../src/lib/integrations");
    const { setFeatureFlags, loadEffectiveFeatures } = await import("../src/lib/settings");
    await verifyIntegration("google");
    await setFeatureFlags({ customer_sign_in: true }, actor);
    const before = process.env.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_SECRET = "a-different-secret";
    expect((await loadEffectiveFeatures()).customer_sign_in).toBe(false);
    const r = await verifyIntegration("google");
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/recognise/);
    process.env.GOOGLE_CLIENT_SECRET = before;
    await verifyIntegration("google");
    expect((await loadEffectiveFeatures()).customer_sign_in).toBe(true);
  });

  it("reports missing configuration instead of calling Google", async () => {
    const { verifyIntegration } = await import("../src/lib/integrations");
    const id = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = "";
    const r = await verifyIntegration("google");
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/GOOGLE_CLIENT_ID/);
    process.env.GOOGLE_CLIENT_ID = id;
  });

  it("customer sessions are separate from staff sessions", async () => {
    const { upsertCustomer } = await import("../src/lib/customers");
    const a = await upsertCustomer({ sub: "s1", email: "Same@Example.org", name: "Same" });
    const b = await upsertCustomer({ sub: "s1", email: "same@example.org", name: "Renamed" });
    expect(b.id).toBe(a.id);
    expect(b.name).toBe("Same"); // a name the person already has isn't overwritten
    const { listAdmins } = await import("../src/lib/admins");
    expect(await listAdmins()).toHaveLength(0); // signing in as a customer never creates staff access
  });
});
