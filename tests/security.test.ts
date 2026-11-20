import { beforeEach, describe, expect, it, vi } from "vitest";
import { actor, setFlags, cleanDbPerTest } from "./helpers";

// The sign-in code reads cookies and headers from the current request; in tests there is none, so give it fakes.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7", "user-agent": "vitest" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  unstable_rethrow: (e: unknown) => {
    if (e instanceof Error && e.message.startsWith("REDIRECT:")) throw e;
  },
}));

import { query } from "../src/lib/db";
import { hashPassword, verifyPassword, safeEqual } from "../src/lib/crypto";
import { checkPassword } from "../src/lib/password-policy";
import { can, PERMISSIONS, ROLES } from "../src/lib/permissions";
import { AdminError, changeAdminRole, createAdminUser, setAdminActive, findAdminByEmail } from "../src/lib/admins";
import { getAdmin, loginWithPassword, endAdminSession, requireAdmin, cookieName } from "../src/lib/auth";
import { renderMarkdown } from "../src/lib/markdown";
import { csvCell, parseTable } from "../src/lib/csv";
import { safeUrl, slugify, parseMoneyToCents, sortSizes } from "../src/lib/util";
import { rateLimit } from "../src/lib/rate-limit";
import { FeatureError, loadEffectiveFeatures, orderingStatus, setFeatureFlags, DEFAULT_STORE_SETTINGS } from "../src/lib/settings";
import { orderWindowMessages } from "../src/lib/order-window";
import { saveDraftContent, publishContent, loadPublishedContent, DEFAULT_CONTENT, savePolicyPage, getPublicPolicy } from "../src/lib/content";
import { UserError } from "../src/lib/errors";

cleanDbPerTest();
beforeEach(() => jar.clear());

describe("passwords", () => {
  it("are hashed with scrypt and verified in constant time", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(h).toMatch(/^scrypt\$/);
    expect(h).not.toContain("correct");
    expect(await verifyPassword("correct horse battery staple", h)).toBe(true);
    expect(await verifyPassword("wrong horse battery staple", h)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("must be long, varied and not guessable", () => {
    expect(checkPassword("short")).toMatch(/12 characters/);
    expect(checkPassword("aaaaaaaaaaaaaaaa")).toMatch(/repeats/);
    expect(checkPassword("password123")).toBeTruthy();
    expect(checkPassword("administrator")).toMatch(/common/);
    // Common words padded with digits or symbols are caught too.
    for (const weak of ["password1234", "Welcome2026!", "Qwerty-12345678", "letmein!!!!!!"]) expect(checkPassword(weak), weak).toMatch(/too common/);
    expect(checkPassword("1357924680135")).toMatch(/only digits/);
    expect(checkPassword("Maple-Quilt-Harbor-83")).toBeNull();
    expect(checkPassword("saif-is-here-now", "saif@example.org")).toMatch(/email name/);
    expect(checkPassword("correct horse battery staple", "x@example.org")).toBeNull();
  });
});

describe("signing in", () => {
  const PASSWORD = "a long passphrase for tests";

  it("starts a session, and a wrong password is refused with the same message as an unknown email", async () => {
    await createAdminUser({ email: "Owner@Example.org", password: PASSWORD, role: "owner" });
    const bad = await loginWithPassword("owner@example.org", "nope nope nope nope");
    const unknown = await loginWithPassword("nobody@example.org", "nope nope nope nope");
    expect(bad).toEqual(unknown);
    expect(bad.ok).toBe(false);
    const good = await loginWithPassword("OWNER@example.org", PASSWORD);
    expect(good.ok).toBe(true);
    expect(jar.get(cookieName())).toBeTruthy();
    expect((await getAdmin())?.email).toBe("owner@example.org");
    // Only a hash of the session token is stored.
    const stored = (await query<{ token_hash: string }>("select token_hash from admin_sessions")).rows[0].token_hash;
    expect(stored).not.toBe(jar.get(cookieName()));
    expect(stored).toHaveLength(64);
  });

  it("locks the account after repeated failures, even for the right password", async () => {
    await createAdminUser({ email: "lock@example.org", password: PASSWORD, role: "admin" });
    for (let i = 0; i < 8; i++) await loginWithPassword("lock@example.org", `wrong password ${i} xx`);
    const res = await loginWithPassword("lock@example.org", PASSWORD);
    expect(res).toMatchObject({ ok: false });
    expect((res as { error: string }).error).toMatch(/locked|too many/i);
  });

  it("signing out ends the session on the server", async () => {
    await createAdminUser({ email: "a@example.org", password: PASSWORD, role: "owner" });
    await loginWithPassword("a@example.org", PASSWORD);
    const token = jar.get(cookieName())!;
    await endAdminSession();
    expect((await query("select 1 from admin_sessions")).rowCount).toBe(0);
    jar.set(cookieName(), token); // replaying the old cookie gets nothing
    expect(await getAdmin()).toBeNull();
  });

  it("revoking a person ends their sessions at once and blocks sign-in", async () => {
    const owner = await createAdminUser({ email: "o@example.org", password: PASSWORD, role: "owner" });
    const staff = await createAdminUser({ email: "s@example.org", password: PASSWORD, role: "staff" });
    await loginWithPassword("s@example.org", PASSWORD);
    expect((await getAdmin())?.role).toBe("staff");
    await setAdminActive(staff.id, false, { id: owner.id, label: owner.email });
    expect(await getAdmin()).toBeNull();
    expect((await loginWithPassword("s@example.org", PASSWORD)).ok).toBe(false);
  });

  it("guards pages: visitors go to sign-in; people without permission go to 'forbidden'", async () => {
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/admin/login");
    await createAdminUser({ email: "s@example.org", password: PASSWORD, role: "staff" });
    await loginWithPassword("s@example.org", PASSWORD);
    await expect(requireAdmin("orders.view")).resolves.toMatchObject({ role: "staff" });
    await expect(requireAdmin("settings.manage")).rejects.toThrow("REDIRECT:/admin/forbidden");
    await query("update admin_users set must_change_password = true");
    await expect(requireAdmin("orders.view")).rejects.toThrow("REDIRECT:/admin/account?required=1");
  });
});

describe("team rules", () => {
  it("there is always at least one owner", async () => {
    const o = await createAdminUser({ email: "o@example.org", password: "a long passphrase for tests", role: "owner" });
    await expect(changeAdminRole(o.id, "admin", actor)).rejects.toThrow(AdminError);
    await expect(setAdminActive(o.id, false, actor)).rejects.toThrow(/last Owner/);
    const o2 = await createAdminUser({ email: "o2@example.org", password: "a long passphrase for tests", role: "owner" });
    await changeAdminRole(o.id, "admin", actor);
    await expect(changeAdminRole(o2.id, "staff", actor)).rejects.toThrow(/at least one Owner/);
  });

  it("emails are unique regardless of case and must look like emails", async () => {
    await createAdminUser({ email: "dup@example.org", password: "a long passphrase for tests", role: "staff" });
    await expect(createAdminUser({ email: "DUP@example.org", password: "a long passphrase for tests", role: "staff" })).rejects.toThrow(/already exists/);
    await expect(createAdminUser({ email: "nope", password: "a long passphrase for tests", role: "staff" })).rejects.toThrow(/valid email/);
    expect(await findAdminByEmail("Dup@Example.org")).toBeTruthy();
  });

  it("permissions: staff cannot edit the catalogue or settings; only owners manage the team", () => {
    expect(can("staff", "inventory.adjust")).toBe(true);
    expect(can("staff", "products.manage")).toBe(false);
    expect(can("admin", "products.manage")).toBe(true);
    expect(can("admin", "settings.manage")).toBe(false);
    expect(can("admin", "team.manage")).toBe(false);
    expect(can("owner", "team.manage")).toBe(true);
    expect(can(null, "orders.view")).toBe(false);
    for (const p of Object.keys(PERMISSIONS)) expect(can("owner", p as keyof typeof PERMISSIONS)).toBe(true);
    expect(ROLES).toEqual(["owner", "admin", "staff"]);
  });
});

describe("the database", () => {
  it("has row level security switched on for every table, with no policies", async () => {
    const t = await query<{ tablename: string; rowsecurity: boolean }>("select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'");
    expect(t.rows.length).toBeGreaterThan(20);
    expect(t.rows.filter((r) => !r.rowsecurity)).toEqual([]);
    expect((await query("select 1 from pg_policies where schemaname = 'public'")).rowCount).toBe(0);
  });

  it("never stores a password or token in the activity log", async () => {
    await createAdminUser({ email: "o@example.org", password: "a long passphrase for tests", role: "owner" });
    await loginWithPassword("o@example.org", "a long passphrase for tests");
    const log = JSON.stringify((await query("select * from audit_log")).rows);
    expect(log).not.toContain("passphrase");
  });

  it("rate limits by key and window", async () => {
    for (let i = 0; i < 3; i++) expect((await rateLimit("t:a", 3, 60)).ok).toBe(true);
    const over = await rateLimit("t:a", 3, 60);
    expect(over.ok).toBe(false);
    expect(over.retryAfter).toBeGreaterThan(0);
    expect((await rateLimit("t:b", 3, 60)).ok).toBe(true);
    await query("update rate_limits set window_start = now() - interval '2 minutes' where key = 't:a'");
    expect((await rateLimit("t:a", 3, 60)).ok).toBe(true);
  });
});

describe("text that visitors read is sanitised", () => {
  it("strips scripts, handlers, images, iframes and unsafe links but keeps formatting", () => {
    const html = renderMarkdown(
      '**Bold** <script>alert(1)</script> <img src=x onerror=alert(1)> [bad](javascript:alert(1)) [ok](https://example.org) <iframe src="https://evil.example"></iframe>\n\n- one\n- two',
    );
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain('href="https://example.org"');
    expect(html).toContain('rel="noopener noreferrer"');
    for (const bad of ["<script", "onerror", "javascript:", "<img", "<iframe"]) expect(html).not.toContain(bad);
  });

  it("only turns http(s) and site paths into links", () => {
    expect(safeUrl("https://example.org/a")).toBe("https://example.org/a");
    expect(safeUrl("/shop")).toBe("/shop");
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "//evil.example", "/\\evil", "ftp://x", "", "  "]) expect(safeUrl(bad)).toBeNull();
  });

  it("CSV exports cannot run as spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(parseTable("a,b\r\n1,2\r\n").rows).toEqual([["1", "2"]]);
  });
});

describe("small helpers", () => {
  it("slugs, money and sizes", () => {
    expect(slugify("ICSI Hoodie & Cap!")).toBe("icsi-hoodie-and-cap");
    expect(slugify("  Crème brûlée  ")).toBe("creme-brulee");
    expect(parseMoneyToCents("$12.50")).toBe(1250);
    expect(parseMoneyToCents("1,200")).toBe(120000);
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("-5")).toBeNull();
    expect(sortSizes(["XL", "10", "S", "2", "M", "YS", "Free"])).toEqual(["YS", "S", "M", "XL", "2", "10", "Free"]);
  });
});

describe("feature switches", () => {
  it("features that need an outside service cannot be switched on until it is verified", async () => {
    await expect(setFeatureFlags({ online_payments: true }, actor)).rejects.toThrow(FeatureError);
    await expect(setFeatureFlags({ email_notifications: true }, actor)).rejects.toThrow(/Missing on the server/);
    await expect(setFeatureFlags({ customer_sign_in: true }, actor)).rejects.toThrow(/Sign in with Google/);
    const eff = await loadEffectiveFeatures();
    expect(eff).toMatchObject({ online_payments: false, email_notifications: false, ai_assistant: false, customer_sign_in: false });
  });

  it("a stored 'on' flag for an unverified service is still treated as off", async () => {
    await setFlags({ online_payments: true, email_notifications: true, restock_alerts: true });
    const eff = await loadEffectiveFeatures();
    expect(eff.online_payments).toBe(false);
    expect(eff.email_notifications).toBe(false);
    expect(eff.restock_alerts).toBe(false);
  });

  it("plain features switch freely, and the change is logged", async () => {
    const r = await setFeatureFlags({ order_requests: true, wishlist: false }, actor);
    expect(r.on).toEqual(["order_requests"]);
    expect(r.off).toEqual(["wishlist"]);
    const eff = await loadEffectiveFeatures();
    expect(eff).toMatchObject({ order_requests: true, wishlist: false, cart: true });
    expect((await query("select 1 from audit_log where action = 'features.update'")).rowCount).toBe(1);
  });

  it("ordering is not open until a way to order is switched on", async () => {
    const off = orderingStatus(await loadEffectiveFeatures(), DEFAULT_STORE_SETTINGS);
    expect(off.open).toBe(false);
    expect(off.message).toMatch(/hasn’t been switched on/);
    await setFeatureFlags({ order_requests: true }, actor);
    expect(orderingStatus(await loadEffectiveFeatures(), DEFAULT_STORE_SETTINGS)).toMatchObject({ open: true, modes: ["request"] });
  });
});

describe("the ordering window wording", () => {
  const tz = "America/New_York";
  const now = new Date("2026-11-03T15:00:00Z");
  it("says when ordering opens, runs until, and closed", () => {
    expect(orderWindowMessages({ opensAt: null, closesAt: null, note: "" }, tz, now).banner).toBeNull();
    expect(orderWindowMessages({ opensAt: "2026-11-10T14:00:00Z", closesAt: null, note: "" }, tz, now)).toMatchObject({ state: "upcoming", title: "Ordering isn’t open yet" });
    const open = orderWindowMessages({ opensAt: null, closesAt: "2026-11-06T19:00:00Z", note: "Pickup the week after." }, tz, now);
    expect(open.banner).toBe("Ordering is open until Friday, November 6 at 2:00 PM EST. Pickup the week after.");
    expect(orderWindowMessages({ opensAt: null, closesAt: "2026-11-01T19:00:00Z", note: "" }, tz, now)).toMatchObject({ state: "closed" });
  });
});

describe("editable content", () => {
  it("is a draft until published, and unsafe links are refused", async () => {
    const draft = { ...DEFAULT_CONTENT, hero: { ...DEFAULT_CONTENT.hero, headline: "New season" } };
    await saveDraftContent(draft, actor);
    expect((await loadPublishedContent()).hero.headline).toBe("ICSI");
    await publishContent(actor);
    expect((await loadPublishedContent()).hero.headline).toBe("New season");
    const evil = { ...DEFAULT_CONTENT, hero: { ...DEFAULT_CONTENT.hero, ctaHref: "javascript:alert(1)" } };
    await expect(saveDraftContent(evil, actor)).rejects.toThrow(UserError);
  });

  it("policy pages stay hidden until they have text and are approved", async () => {
    expect(await getPublicPolicy("returns")).toBeNull();
    await expect(savePolicyPage("returns", "", true, actor)).rejects.toThrow(/Write the text/);
    await savePolicyPage("returns", "Returns within 14 days.", false, actor);
    expect(await getPublicPolicy("returns")).toBeNull();
    await savePolicyPage("returns", "Returns within 14 days.", true, actor);
    expect((await getPublicPolicy("returns"))?.body_md).toContain("14 days");
  });
});
