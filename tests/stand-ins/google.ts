import http from "node:http";
import crypto from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";

/**
 * A local stand-in for Google's OpenID Connect endpoints, used ONLY by automated tests.
 * It speaks the same protocol (discovery, authorize, token with PKCE, JWKS) so the real sign-in code runs end to end.
 */
export interface FakeGoogleUser {
  sub: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
  hd?: string;
}

export interface FakeGoogle {
  url: string;
  clientId: string;
  clientSecret: string;
  /** The account that "signs in" the next time the browser reaches the authorize page. `null` = the person cancels. */
  setUser(u: FakeGoogleUser | null): void;
  /** Tamper with the next ID token: wrong audience, wrong nonce or a bad signature. */
  breakNext(kind: "audience" | "nonce" | "signature" | "expired" | null): void;
  requests: string[];
  close(): Promise<void>;
}

export async function startFakeGoogle(port = 0, creds = { clientId: "stand-in-client.apps.googleusercontent.com", clientSecret: "stand-in-secret" }): Promise<FakeGoogle> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const { privateKey: otherKey } = await generateKeyPair("RS256");
  let user: FakeGoogleUser | null = { sub: "g-1", email: "shopper@example.org", name: "Sample Shopper", emailVerified: true };
  let breaker: "audience" | "nonce" | "signature" | "expired" | null = null;
  const codes = new Map<string, { nonce: string; challenge: string; user: FakeGoogleUser; redirect: string }>();
  const requests: string[] = [];
  let base = "";

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", base || "http://localhost");
    requests.push(`${req.method} ${u.pathname}`);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (u.pathname === "/.well-known/openid-configuration") {
      return json(200, { issuer: base, authorization_endpoint: `${base}/auth`, token_endpoint: `${base}/token`, jwks_uri: `${base}/jwks` });
    }
    if (u.pathname === "/jwks") return json(200, { keys: [jwk] });
    if (u.pathname === "/auth") {
      const redirect = u.searchParams.get("redirect_uri") ?? "";
      const state = u.searchParams.get("state") ?? "";
      if (u.searchParams.get("client_id") !== creds.clientId) return json(400, { error: "invalid_client" });
      if (u.searchParams.get("code_challenge_method") !== "S256" || !u.searchParams.get("code_challenge")) return json(400, { error: "pkce_required" });
      const target = new URL(redirect);
      if (!user) target.search = new URLSearchParams({ error: "access_denied", state }).toString();
      else {
        const code = crypto.randomBytes(12).toString("hex");
        codes.set(code, { nonce: u.searchParams.get("nonce") ?? "", challenge: u.searchParams.get("code_challenge")!, user, redirect });
        target.search = new URLSearchParams({ code, state }).toString();
      }
      res.writeHead(302, { location: target.toString() });
      return res.end();
    }
    if (u.pathname === "/token" && req.method === "POST") {
      const raw = await new Promise<string>((r) => {
        let s = "";
        req.on("data", (c) => (s += c));
        req.on("end", () => r(s));
      });
      const p = new URLSearchParams(raw);
      if (p.get("client_id") !== creds.clientId || p.get("client_secret") !== creds.clientSecret) return json(401, { error: "invalid_client" });
      const entry = codes.get(p.get("code") ?? "");
      if (!entry) return json(400, { error: "invalid_grant" });
      codes.delete(p.get("code")!);
      const verifier = p.get("code_verifier") ?? "";
      if (crypto.createHash("sha256").update(verifier).digest("base64url") !== entry.challenge) return json(400, { error: "invalid_grant", error_description: "PKCE failed" });
      const now = Math.floor(Date.now() / 1000);
      const key: CryptoKey = breaker === "signature" ? otherKey : privateKey;
      const jwt = await new SignJWT({
        email: entry.user.email,
        email_verified: entry.user.emailVerified ?? true,
        name: entry.user.name ?? "",
        ...(entry.user.hd ? { hd: entry.user.hd } : {}),
        nonce: breaker === "nonce" ? "wrong" : entry.nonce,
      })
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(base)
        .setAudience(breaker === "audience" ? "someone-else" : creds.clientId)
        .setSubject(entry.user.sub)
        .setIssuedAt(breaker === "expired" ? now - 7200 : now)
        .setExpirationTime(breaker === "expired" ? now - 3600 : now + 3600)
        .sign(key);
      breaker = null;
      return json(200, { access_token: "stand-in", token_type: "Bearer", expires_in: 3600, id_token: jwt });
    }
    json(404, { error: "not_found" });
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
  return {
    url: base,
    ...creds,
    setUser: (u) => (user = u),
    breakNext: (k) => (breaker = k),
    requests,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
