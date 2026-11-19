import { expect, test } from "@playwright/test";
import { accounts, adminLogin, alertOf, control, watchProblems } from "./helpers";

test.describe.configure({ mode: "serial" });

const asGoogleUser = (request: Parameters<typeof control>[0], user: Record<string, unknown> | null) => control(request, "POST", "/google/user", { user });

test.describe("customer sign-in with Google (against a stand-in for Google)", () => {
  test("a shopper signs in, sees their earlier orders, and signs out", async ({ page, request }) => {
    const problems = watchProblems(page);
    await asGoogleUser(request, { sub: "shopper-1", email: "pat@example.com", name: "Pat Parent", emailVerified: true });
    await page.goto("/account/login");
    await page.getByRole("link", { name: /continue with google/i }).click();
    await page.waitForURL("**/account");
    await expect(page.getByText("pat@example.com")).toBeVisible();
    // The order placed as a guest with the same (Google-verified) email is listed.
    await expect(page.getByText(/ICSI-[A-Z0-9]{4}-[A-Z0-9]{4}/).first()).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Account" }).or(page.getByRole("link", { name: "Account" }).first())).toBeVisible();

    // Checkout is pre-filled for them.
    await page.goto("/products/sample-polo-shirt");
    await page.locator('label:has(input[name="color"])').first().click();
    await page.getByText("M", { exact: true }).first().click();
    await page.getByRole("button", { name: "Add to Bag" }).click();
    await page.getByRole("link", { name: "Checkout" }).click();
    await page.waitForURL("**/checkout");
    await expect(page.locator("#email")).toHaveValue("pat@example.com");
    await expect(page.locator("#name")).toHaveValue("Pat Parent");

    // A customer session never opens the admin.
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);

    await page.goto("/account");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("**/");
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account\/login/);
    expect(problems).toEqual([]);
  });

  test("cancelling at Google, or a tampered/unverified sign-in, signs nobody in and explains kindly", async ({ page, request }) => {
    await asGoogleUser(request, null);
    await page.goto("/account/login");
    await page.getByRole("link", { name: /continue with google/i }).click();
    await page.waitForURL(/\/account\/login\?error=google_cancelled/);
    await expect(page.getByText(/sign-in was cancelled/i)).toBeVisible();

    await asGoogleUser(request, { sub: "x1", email: "x@example.com", emailVerified: false });
    await page.goto("/account/login");
    await page.getByRole("link", { name: /continue with google/i }).click();
    await page.waitForURL(/error=google_failed/);
    await expect(page.getByText(/couldn’t complete the Google sign-in/i)).toBeVisible();

    for (const kind of ["audience", "nonce", "signature", "expired"]) {
      await asGoogleUser(request, { sub: "x2", email: "x2@example.com", emailVerified: true });
      await control(request, "POST", "/google/break", { kind });
      await page.goto("/account/login");
      await page.getByRole("link", { name: /continue with google/i }).click();
      await page.waitForURL(/error=google_failed/);
    }
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account\/login/);
  });

  test("a callback with no matching browser hand-off is refused, not a server error", async ({ request }) => {
    const res = await request.get("/api/auth/google/callback?code=abc&state=forged", { maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect(res.headers().location).toMatch(/error=google_failed/);
  });

  test("a shopper can delete their account", async ({ page, request }) => {
    await asGoogleUser(request, { sub: "delete-me", email: "delete.me@example.com", name: "Delete Me", emailVerified: true });
    await page.goto("/account/login");
    await page.getByRole("link", { name: /continue with google/i }).click();
    await page.waitForURL("**/account");
    await page.getByText("Delete my account").first().click();
    await page.getByRole("button", { name: "Delete my account" }).click();
    await page.waitForURL(/account=deleted/);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account\/login/);
  });
});

test.describe("staff sign-in with Google is an allow-list", () => {
  test("a team member signs in; the sign-in is written to the activity log", async ({ page, request }) => {
    await asGoogleUser(request, { sub: "owner-g", email: accounts.owner, name: "Olive Owner", emailVerified: true });
    await page.goto("/admin/login");
    await page.getByRole("link", { name: /sign in with google/i }).click();
    await page.waitForURL(/\/admin(\/)?$/);
    await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();
    await page.goto("/admin/audit");
    await expect(page.getByText(/signed in with google/i).first()).toBeVisible();
  });

  test("nobody else can get in this way: not a stranger, not a customer, not an unverified address", async ({ page, request }) => {
    for (const user of [
      { sub: "s1", email: "stranger@example.org", emailVerified: true },
      { sub: "s2", email: "pat@example.com", emailVerified: true },
      { sub: "s3", email: accounts.owner, emailVerified: false },
    ]) {
      await asGoogleUser(request, user);
      await page.goto("/admin/login");
      await page.getByRole("link", { name: /sign in with google/i }).click();
      await page.waitForURL(/\/admin\/login\?error=/);
      await expect(alertOf(page).or(page.locator("[class*=amber], [class*=yellow]")).or(page.getByText(/isn’t on this store’s team|couldn’t complete/i)).first()).toBeVisible();
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/admin\/login/);
    }
  });

  test("the sign-in can be limited to the organization’s own Google Workspace domain", async ({ page, browser, request }) => {
    await adminLogin(page);
    await page.goto("/admin/settings#staff");
    await page.getByLabel(/only allow this domain/i).fill("example.org");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: /settings saved/i })).toBeVisible();

    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    // A matching address WITHOUT Google's hosted-domain claim is not enough.
    await asGoogleUser(request, { sub: "d1", email: accounts.manager, emailVerified: true });
    await p2.goto("/admin/login");
    await p2.getByRole("link", { name: /sign in with google/i }).click();
    await p2.waitForURL(/error=google_domain/);
    await expect(p2.getByText(/organization’s Google account/i)).toBeVisible();
    // With the claim it works.
    await asGoogleUser(request, { sub: "d1", email: accounts.manager, emailVerified: true, hd: "example.org" });
    await p2.goto("/admin/login");
    await p2.getByRole("link", { name: /sign in with google/i }).click();
    await p2.waitForURL(/\/admin(\/)?$/);
    await ctx.close();

    await page.getByLabel(/only allow this domain/i).fill("");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: /settings saved/i })).toBeVisible();
  });

  test("the sign-in can't be used to bounce someone to another website", async ({ page, request }) => {
    await asGoogleUser(request, { sub: "owner-g", email: accounts.owner, emailVerified: true });
    await page.goto("/api/auth/google/start?type=admin&next=//evil.example.com/phish");
    await page.waitForURL(/\/admin/);
    expect(new URL(page.url()).origin).toBe(new URL(process.env.E2E_BASE_URL ?? "http://localhost:3100").origin);
  });
});
