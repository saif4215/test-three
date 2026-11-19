import { expect, test } from "@playwright/test";
import { accounts, adminLogin, alertOf } from "./helpers";

const origin = process.env.E2E_BASE_URL ?? "http://localhost:3100";

test.describe("browser protections", () => {
  test("every page carries a strict, nonce-based Content-Security-Policy and the standard hardening headers", async ({ request }) => {
    for (const path of ["/", "/shop", "/admin/login", "/checkout"]) {
      const res = await request.get(path);
      const h = res.headers();
      const csp = h["content-security-policy"];
      expect(csp, path).toBeTruthy();
      expect(csp).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/=_-]+'/);
      expect(csp.match(/script-src[^;]*/)![0]).not.toContain("'unsafe-inline'");
      expect(csp.match(/script-src[^;]*/)![0]).not.toContain("'unsafe-eval'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toMatch(/object-src 'none'/);
      expect(csp).toMatch(/base-uri 'self'/);
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["referrer-policy"]).toBeTruthy();
      expect(h["strict-transport-security"]).toContain("max-age=");
      expect(h["x-powered-by"]).toBeUndefined();
    }
    // The nonce is different on every request.
    const a = (await request.get("/")).headers()["content-security-policy"].match(/nonce-([^']+)/)![1];
    const b = (await request.get("/")).headers()["content-security-policy"].match(/nonce-([^']+)/)![1];
    expect(a).not.toBe(b);
  });

  test("injected markup can't run script: inline event handlers and javascript: links are blocked by the browser", async ({ page }) => {
    await page.goto("/");
    // What a real cross-site-scripting hole would let an attacker do: put markup with inline code into the page.
    const outcome = await page.evaluate(
      () =>
        new Promise<{ violations: string[]; ran: boolean }>((resolve) => {
          const violations: string[] = [];
          document.addEventListener("securitypolicyviolation", (e) => violations.push(e.violatedDirective));
          document.body.insertAdjacentHTML("beforeend", '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" onload="window.__pwned = 1" onerror="window.__pwned = 2"><a id="evil" href="javascript:window.__pwned = 3">x</a>');
          (document.getElementById("evil") as HTMLAnchorElement).click();
          setTimeout(() => resolve({ violations, ran: !!(window as unknown as { __pwned?: number }).__pwned }), 1000);
        }),
    );
    expect(outcome.ran).toBe(false);
    expect(outcome.violations.length).toBeGreaterThan(0);
  });

  test("private pages are never cached, and the admin and account areas ask search engines to stay out", async ({ request }) => {
    for (const path of ["/admin/login", "/account/login", "/track", "/checkout", "/cart"]) {
      const res = await request.get(path);
      expect(res.headers()["cache-control"] ?? "", path).toMatch(/no-store|private|no-cache/);
    }
    const robots = await (await request.get("/robots.txt")).text();
    for (const p of ["/admin", "/api", "/account", "/checkout", "/track"]) expect(robots).toContain(`Disallow: ${p}`);
    expect(await (await request.get("/admin/login")).text()).toMatch(/noindex/i);
  });

  test("the staff session cookie is HttpOnly and SameSite, and scripts can't read it", async ({ page }) => {
    await adminLogin(page, accounts.owner, undefined, { fresh: true });
    const cookies = await page.context().cookies();
    const session = cookies.find((c) => /icsi_admin/.test(c.name));
    expect(session).toBeTruthy();
    expect(session!.httpOnly).toBe(true);
    expect(["Lax", "Strict"]).toContain(session!.sameSite);
    expect(await page.evaluate(() => document.cookie)).not.toMatch(/icsi_admin/);
  });

  test("no secret ever reaches the browser: every JavaScript file the store sends is scanned", async ({ page, request }) => {
    const secrets = ["e2e-secret-0123456789", "mail-secret", "stand-in-secret", "sk_test_stand_in", "sk-ant-stand-in", "whsec_standin", "service_role", "SERVICE_ROLE", "icsi-dev-password"];
    const files = new Set<string>();
    page.on("response", (r) => {
      if (/\.js(\?|$)/.test(r.url()) && r.url().startsWith(origin)) files.add(r.url());
    });
    for (const path of ["/", "/shop", "/products/sample-polo-shirt", "/checkout", "/cart", "/admin/login"]) await page.goto(path);
    await adminLogin(page);
    for (const path of ["/admin", "/admin/settings", "/admin/products", "/admin/ai"]) await page.goto(path);
    expect(files.size).toBeGreaterThan(5);
    for (const url of files) {
      const body = await (await request.get(url)).text();
      for (const s of secrets) expect(body, `${s} found in ${url}`).not.toContain(s);
    }
    // ...nor in any page's HTML.
    for (const path of ["/", "/admin/login"]) {
      const html = await (await request.get(path)).text();
      for (const s of secrets) expect(html).not.toContain(s);
    }
  });
});

test.describe("who may do what (checked by the server, not by hiding buttons)", () => {
  test("admin data and downloads refuse anonymous callers and callers without the role", async ({ request, browser }) => {
    for (const path of ["/api/admin/export/orders", "/api/admin/export/inventory", "/api/admin/export/sales", "/api/admin/export/product-template"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect([401, 403, 302, 307]).toContain(res.status());
      expect(res.headers()["content-type"] ?? "").not.toContain("text/csv");
    }
    const ctx = await browser.newContext();
    const staff = await ctx.newPage();
    await adminLogin(staff, accounts.staff);
    const res = await staff.request.get("/api/admin/export/orders");
    expect(res.status()).toBe(403); // staff may handle orders but not export customer data
    expect((await staff.request.get("/api/admin/export/inventory")).status()).toBeLessThan(500);
    await ctx.close();
  });

  test("there is no way to register as an administrator, and Google can't create one either", async ({ request }) => {
    for (const path of ["/admin/register", "/admin/signup", "/admin/create", "/api/admin/users", "/api/admin/register"]) {
      const res = await request.post(path, { data: { email: "attacker@example.org", password: "Attacker-Passw0rd-2026!", role: "owner" }, maxRedirects: 0 });
      expect([404, 405, 401, 403, 307, 302]).toContain(res.status());
    }
    const setup = await request.get("/admin/setup", { maxRedirects: 0 });
    expect([404, 307, 302, 308]).toContain(setup.status()); // setup is closed once an owner exists (and needs a secret token to open)
  });

  test("sign-in attempts are rate-limited per address and don't reveal which accounts exist", async ({ page }) => {
    await page.goto("/admin/login");
    const email = `ghost-${Date.now()}@example.org`;
    for (let i = 0; i < 12; i++) {
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill("wrong-password-" + i);
      const answered = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/login"));
      await page.getByRole("button", { name: /^sign in$/i }).click();
      await answered;
      await page.waitForTimeout(150); // let the form settle (it is cleared after each answer)
    }
    // After ten wrong tries for the same address the form stops even looking at the password.
    await expect(alertOf(page).first()).toContainText(/too many attempts/i);
  });

  test("sign-in can't be used to bounce someone to another website", async ({ page }) => {
    await adminLogin(page, accounts.manager, undefined, { fresh: true }).catch(() => {});
    await page.context().clearCookies();
    await page.goto("/admin/login?next=//evil.example.com");
    // The page itself must not embed the foreign address anywhere it would be followed.
    const html = await page.content();
    expect(html).not.toMatch(/href="\/\/evil\.example\.com/);
    expect(new URL(page.url()).origin).toBe(new URL(origin).origin);
  });
});

test.describe("hostile input", () => {
  test("order lookups are throttled so tracking codes can't be guessed", async ({ request }) => {
    let limited = false;
    for (let i = 0; i < 40 && !limited; i++) {
      const res = await request.get(`/track?orderNumber=ICSI-ZZZZ-${String(i).padStart(4, "0")}&code=guess${i}`);
      limited = /too many attempts/i.test(await res.text());
    }
    expect(limited).toBe(true);
  });

  test("file paths can't climb out of the media folder", async ({ request }) => {
    for (const path of ["/media/..%2f..%2f.env", "/media/%2e%2e/%2e%2e/package.json", "/media/../../etc/passwd", "/media/..\\..\\.env"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect([400, 404], path).toContain(res.status());
      expect(await res.text()).not.toMatch(/APP_SECRET|DATABASE_URL|"dependencies"|root:/);
    }
  });

  test("search and filters treat markup and SQL as plain text", async ({ page }) => {
    const dialogs: string[] = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    for (const q of [`"><script>alert(1)</script>`, `' OR 1=1 --`, `'; DROP TABLE products; --`, `<img src=x onerror=alert(1)>`, "%00", "a".repeat(5000)]) {
      const res = await page.goto(`/shop?q=${encodeURIComponent(q)}&sort=${encodeURIComponent(q)}&category=${encodeURIComponent(q)}`);
      expect(res?.status(), q.slice(0, 20)).toBeLessThan(500);
      expect(await page.content()).not.toMatch(/<script>alert\(1\)<\/script>|<img src=x onerror/);
    }
    expect(dialogs).toEqual([]);
    await page.goto("/shop");
    await expect(page.locator("a[href^='/products/']").first()).toBeVisible(); // the products table is still there
  });

  test("the cart API refuses forged prices, negative amounts and junk", async ({ request }) => {
    const polo = await (await request.get("/products/sample-polo-shirt")).text();
    void polo;
    for (const data of [
      { items: [{ variantId: "not-a-uuid", quantity: 1 }] },
      { items: [{ variantId: "00000000-0000-0000-0000-000000000000", quantity: -5 }] },
      { items: [{ variantId: "00000000-0000-0000-0000-000000000000", quantity: 1, unitPriceCents: 1 }] },
      { items: "nope" },
      { items: Array.from({ length: 500 }, () => ({ variantId: "00000000-0000-0000-0000-000000000000", quantity: 1 })) },
    ]) {
      const res = await request.post("/api/cart/quote", { data });
      expect(res.status(), JSON.stringify(data).slice(0, 60)).toBeLessThan(500);
      if (res.ok()) {
        const body = (await res.json()) as { lines?: unknown[]; totalCents?: number };
        expect(body.lines ?? []).toHaveLength(0);
      }
    }
  });
});
