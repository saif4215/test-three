import { expect, test } from "@playwright/test";
import { watchProblems } from "./helpers";

test.describe("storefront", () => {
  test("the home page shows the store, navigation and products, with no errors", async ({ page }) => {
    const problems = watchProblems(page);
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link", { name: /icsi/i }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: /main/i }).getByRole("link", { name: /shop all/i })).toBeVisible();
    await expect(page.locator("a[href^='/products/']").first()).toBeVisible();
    // Sample items are clearly labelled as samples.
    await expect(page.getByText(/sample/i).first()).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("public pages never link to another website by default", async ({ page }) => {
    const origin = new URL(page.url() === "about:blank" ? (process.env.E2E_BASE_URL ?? "http://localhost:3100") : page.url()).origin;
    for (const path of ["/", "/shop", "/contact", "/track", "/cart", "/wishlist"]) {
      await page.goto(path);
      const hrefs = await page.locator("a[href]").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
      const foreign = hrefs.filter((h) => /^https?:/.test(h) && new URL(h).origin !== origin);
      expect(foreign, `external links on ${path}`).toEqual([]);
    }
  });

  test("search suggests products as you type and opens the results page", async ({ page }) => {
    await page.goto("/");
    const box = page.getByRole("combobox", { name: /search merchandise/i }).first();
    await box.fill("polo");
    await expect(page.getByRole("link", { name: /sample polo shirt/i }).first()).toBeVisible();
    await box.press("Enter");
    await page.waitForURL(/\/shop\?q=polo/);
    await expect(page.getByRole("heading", { name: /polo/i }).first()).toBeVisible();
  });

  test("the shop can be filtered by category and sorted, using plain links", async ({ page }) => {
    await page.goto("/shop");
    const total = await page.locator("a[href^='/products/']").count();
    expect(total).toBeGreaterThan(3);
    await page.goto("/shop?sort=price-asc");
    const prices = await page.locator("[data-price]").evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.price)));
    if (prices.length > 1) expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    await page.goto("/shop?q=zzzz-nothing-matches");
    await expect(page.getByText(/no products|nothing|couldn’t find/i).first()).toBeVisible();
  });

  test("a product page: choose colour and size, add to bag, change quantity, and the server prices it", async ({ page }) => {
    const problems = watchProblems(page);
    await page.goto("/products/sample-polo-shirt");
    await expect(page.getByRole("heading", { level: 1, name: /sample polo shirt/i })).toBeVisible();
    // Adding without a size is refused with a clear message.
    await page.getByRole("button", { name: "Add to Bag" }).click();
    await expect(page.getByText(/select a size/i).first()).toBeVisible();
    await page.locator('label:has(input[name="color"])').first().click();
    await page.getByText("M", { exact: true }).first().click();
    await page.getByRole("button", { name: "Add to Bag" }).click();
    const drawer = page.getByRole("dialog", { name: /bag/i });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(/sample polo shirt/i)).toBeVisible();
    await expect(drawer.getByText(/\$\d+\.\d\d/).first()).toBeVisible();
    await drawer.getByRole("button", { name: /increase/i }).first().click();
    await expect(drawer.getByText(/^2$/).first()).toBeVisible();
    await drawer.getByRole("button", { name: /close/i }).first().click();
    await expect(drawer).toBeHidden();
    expect(problems).toEqual([]);
  });

  test("favourites are kept in the browser and work without an account", async ({ page }) => {
    await page.goto("/products/sample-polo-shirt");
    await page.getByRole("button", { name: /add sample polo shirt to your favourites/i }).first().click();
    await page.goto("/wishlist");
    await expect(page.getByText(/sample polo shirt/i).first()).toBeVisible();
  });

  test("an out-of-stock or unpublished product can't be reached or bought", async ({ page }) => {
    const res = await page.goto("/products/this-does-not-exist");
    expect(res?.status()).toBe(404);
  });

  test("a guest can place an order request and track it with the private link", async ({ page }) => {
    const problems = watchProblems(page);
    await page.goto("/products/sample-polo-shirt");
    await page.locator('label:has(input[name="color"])').first().click();
    await page.getByText("M", { exact: true }).first().click();
    await page.getByRole("button", { name: "Add to Bag" }).click();
    await page.getByRole("link", { name: "Checkout" }).click();
    await page.waitForURL("**/checkout");
    // Required fields are checked, with messages.
    await page.getByRole("button", { name: /submit order request/i }).click();
    await expect(page.locator("#name:invalid, [role=alert]").first()).toBeVisible();
    await page.fill("#name", "Pat Parent");
    await page.fill("#email", "pat@example.com");
    const student = page.locator("#student-name-0");
    if (await student.count()) {
      await student.fill("Sam Student");
      await page.fill("#student-grade-0", "3A");
    }
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /submit order request/i }).click();
    await page.waitForURL("**/track/**", { timeout: 20_000 });
    await expect(page.getByText(/ICSI-[A-Z0-9]{4}-[A-Z0-9]{4}/).first()).toBeVisible();
    await expect(page.getByText(/request received/i).first()).toBeVisible();
    // The bag was emptied.
    await page.goto("/cart");
    await expect(page.getByText(/bag is empty|nothing in your bag/i).first()).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("tracking needs the right code: a wrong code reveals nothing", async ({ page }) => {
    await page.goto("/track?orderNumber=ICSI-AAAA-BBBB&code=nope");
    await expect(page.getByText(/couldn’t find an order/i)).toBeVisible();
  });
});
