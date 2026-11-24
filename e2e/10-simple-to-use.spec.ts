import { expect, test, type Page } from "@playwright/test";
import { adminLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

const adminNav = (page: Page) => page.getByRole("navigation", { name: "Admin" });
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A menu link by its label; Orders carries a count badge ("Orders 2"), so allow a trailing number. */
const menuLink = (page: Page, name: string) => adminNav(page).getByRole("link", { name: new RegExp(`^${escapeRe(name)}(\\s\\d+)?$`) });

async function placeRequestOrder(page: Page): Promise<string> {
  await page.goto("/products/sample-polo-shirt");
  const colours = page.locator('label:has(input[name="color"])');
  if (await colours.count()) await colours.first().click();
  await page.locator('label:has(input[name="size"]):not(:has(input:disabled))').first().click();
  await page.getByRole("button", { name: "Add to Bag" }).click();
  await page.getByRole("link", { name: "Checkout" }).click();
  await page.waitForURL("**/checkout");
  await page.fill("#name", "Quick Action Parent");
  await page.fill("#email", "quick.action@example.com");
  const student = page.locator("#student-name-0");
  if (await student.count()) {
    await student.fill("Robin Student");
    await page.fill("#student-grade-0", "4B");
  }
  const request = page.getByRole("radio", { name: /send an order request/i });
  if (await request.count()) await request.check();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /submit order request/i }).click();
  await page.waitForURL(/\/track\//);
  // Read the order number from the address, not the page: the tracking page is rate-limited, and a long test run shares one visitor address.
  return decodeURIComponent(new URL(page.url()).pathname.split("/").pop() ?? "");
}

test.describe("simple to use", () => {
  test("the admin menu keeps everyday jobs in view and tucks the rest under More", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin");
    for (const name of ["Dashboard", "Orders", "Products", "Inventory", "Homepage & content", "Settings"]) {
      await expect(menuLink(page, name)).toBeVisible();
    }
    // The rest is folded away until asked for.
    await expect(menuLink(page, "Team")).toBeHidden();
    await expect(menuLink(page, "Promotions")).toBeHidden();
    await adminNav(page).getByText("More", { exact: true }).click();
    for (const name of ["Categories", "Collections", "Promotions", "Analytics", "Announcements", "Policy pages", "Writing assistant", "Team", "Email log", "Activity log"]) {
      await expect(menuLink(page, name)).toBeVisible();
    }
  });

  test("More opens by itself on a page that lives inside it", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/team");
    const link = menuLink(page, "Team");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("aria-current", "page");
    await page.goto("/admin/content/announcements");
    await expect(menuLink(page, "Announcements")).toHaveAttribute("aria-current", "page");
    // "Homepage & content" does not light up as well.
    await expect(menuLink(page, "Homepage & content")).not.toHaveAttribute("aria-current", "page");
  });

  test("an order moves forward with one button in the list: Confirm, Mark ready, Mark completed", async ({ page }) => {
    const number = await placeRequestOrder(page);
    await adminLogin(page);
    await page.goto(`/admin/orders?q=${encodeURIComponent(number)}`);
    const row = page.locator("tbody tr", { hasText: number });
    await expect(row.getByText("Request received")).toBeVisible();
    await row.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(row.getByText("Confirmed", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Mark ready" }).click();
    await expect(row.getByText("Ready", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Mark completed" }).click();
    await expect(row.getByText("Completed", { exact: true })).toBeVisible();
    // Nothing more to do on a finished order.
    await expect(row.getByRole("button")).toHaveCount(0);
  });

  test("the dashboard puts waiting orders first", async ({ page }) => {
    await placeRequestOrder(page);
    await adminLogin(page);
    await page.goto("/admin");
    await expect(page.getByRole("link", { name: /^Review \d+ waiting$/ })).toBeVisible();
    await page.getByRole("link", { name: /^Review \d+ waiting$/ }).click();
    await page.waitForURL(/status=pending/);
  });

  test("settings: everyday switches first, the ones needing an outside service folded into one section", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/settings");
    const services = page.locator("#services");
    await expect(services.locator("summary")).toContainText("Connect other services");
    for (const key of ["online_payments", "email_notifications", "customer_sign_in", "ai_assistant"]) {
      await expect(services.locator(`input[name="f.${key}"]`)).toHaveCount(1);
    }
    for (const key of ["cart", "order_requests", "wishlist", "promotions", "order_tracking"]) {
      await expect(page.locator(`input[name="f.${key}"]`)).toHaveCount(1);
      await expect(services.locator(`input[name="f.${key}"]`)).toHaveCount(0);
    }
  });

  // Last in this file: it removes the sample products for good.
  test("the dashboard can remove every sample product in one click", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Sample products" })).toBeVisible();
    await page.getByRole("button", { name: "Remove all sample products" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Removed \d+ sample products/ })).toBeVisible();
    await expect.poll(async () => (await (await page.request.get("/shop")).text()).includes("Sample Polo Shirt")).toBeFalsy();
  });
});
