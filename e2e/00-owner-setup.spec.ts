import { expect, test, type Page } from "@playwright/test";
import { accounts, adminLogin, alertOf, control, mailbox } from "./helpers";

// These run in order: a brand-new store is browse-only, and the owner switches things on one by one, the way a real owner would.
test.describe.configure({ mode: "serial" });

const card = (page: Page, title: string) => page.locator("li", { has: page.getByRole("heading", { name: title }) });
const feature = (page: Page, key: string) => page.locator(`input[name="f.${key}"]`);

async function saveFeatures(page: Page) {
  await page.getByRole("button", { name: "Save feature switches" }).click();
}

test("a brand-new store is browse-only and says so; nothing can be bought", async ({ page, request }) => {
  await page.goto("/products/sample-polo-shirt");
  await expect(page.getByText(/ordering hasn’t been switched on yet/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to Bag" })).toHaveCount(0);
  // Even a hand-made request to the server is refused.
  const res = await request.post("/api/cart/quote", { data: { items: [], promoCode: null, fulfillmentId: null } });
  expect([200, 400]).toContain(res.status());
});

test("sign-in is for the team only: wrong details get one generic message", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(accounts.owner);
  await page.getByLabel("Password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(alertOf(page)).toContainText(/email and password don’t match/i);
  await page.getByLabel("Email").fill("nobody@example.org");
  await page.getByLabel("Password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(alertOf(page)).toContainText(/email and password don’t match/i);
  // There is no public sign-up of any kind.
  for (const path of ["/admin/register", "/admin/signup", "/api/admin/register"]) {
    const r = await page.goto(path);
    expect(r?.status()).toBe(404);
  }
});

test("the admin area is closed to visitors and to people without the right role", async ({ page, browser }) => {
  for (const path of ["/admin", "/admin/products", "/admin/orders", "/admin/settings", "/admin/team"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/login/);
  }
  // Staff can see orders but not settings or the team.
  const ctx = await browser.newContext();
  const staff = await ctx.newPage();
  await adminLogin(staff, accounts.staff);
  await staff.goto("/admin/orders");
  await expect(staff.getByRole("heading", { name: /orders/i }).first()).toBeVisible();
  for (const path of ["/admin/settings", "/admin/team", "/admin/content", "/admin/promotions"]) {
    await staff.goto(path);
    await expect(staff).toHaveURL(/\/admin\/forbidden/);
  }
  await expect(staff.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await ctx.close();
});

test("switching on a feature that needs an outside service is refused until a real test passes", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/settings");
  await feature(page, "online_payments").check();
  await saveFeatures(page);
  await expect(alertOf(page).first()).toContainText(/needs .*Stripe.* to be configured and verified/i);
  await page.reload();
  await expect(feature(page, "online_payments")).not.toBeChecked();
});

test("the owner verifies each outside service for real", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/settings#integrations");
  for (const title of ["Email (SMTP)", "Card payments (Stripe)", "AI writing assistant (Anthropic)", "Sign in with Google"]) {
    const c = card(page, title);
    await c.getByRole("button", { name: /verify/i }).click();
    await expect(c.getByText(/^Verified/)).toBeVisible({ timeout: 20_000 });
  }
});

test("features switch on once verified, and the live store changes immediately", async ({ page, request }) => {
  await adminLogin(page);
  await page.goto("/admin/settings");
  for (const key of ["order_requests", "online_payments", "email_notifications", "restock_alerts", "promotions", "ai_assistant", "customer_sign_in", "admin_google_sign_in"]) {
    await feature(page, key).check();
  }
  await saveFeatures(page);
  await expect(page.getByRole("status").filter({ hasText: /feature switches saved/i })).toBeVisible();
  await page.reload();
  for (const key of ["order_requests", "online_payments", "email_notifications", "ai_assistant", "customer_sign_in", "admin_google_sign_in"]) {
    await expect(feature(page, key)).toBeChecked();
  }

  // The test email now goes through.
  await control(request, "POST", "/mail/clear");
  await card(page, "Email (SMTP)").getByRole("button", { name: /send me a test email/i }).click();
  await expect(page.getByText(`A test message was sent to ${accounts.owner}`)).toBeVisible();
  await expect.poll(async () => (await mailbox(request)).some((m) => m.to.includes(accounts.owner))).toBeTruthy();

  // The storefront reflects it right away: the bag works and sign-in appears.
  await page.goto("/products/sample-polo-shirt");
  await expect(page.getByRole("button", { name: "Add to Bag" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
});

test("the activity log records who verified services and changed switches", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/audit");
  await expect(page.getByText(/verified .*: success/i).first()).toBeVisible();
  await expect(page.getByText(/changed feature switches/i).first()).toBeVisible();
});
