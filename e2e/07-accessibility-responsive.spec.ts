import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { adminLogin } from "./helpers";

const publicPages = ["/", "/shop", "/products/sample-polo-shirt", "/cart", "/track", "/contact", "/wishlist", "/account/login", "/category/accessories"];
const adminPages = ["/admin", "/admin/products", "/admin/products/new", "/admin/products/import", "/admin/orders", "/admin/orders/packing-list", "/admin/inventory", "/admin/promotions", "/admin/analytics", "/admin/content", "/admin/content/announcements", "/admin/content/pages", "/admin/settings", "/admin/team", "/admin/ai", "/admin/audit", "/admin/emails"];

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n   ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n   ")}`);
}

test.describe("accessibility (axe, WCAG 2.2 A/AA): no serious or critical problems", () => {
  for (const path of publicPages) {
    test(`storefront ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await violations(page)).toEqual([]);
    });
  }

  test("checkout (with something in the bag)", async ({ page }) => {
    await page.goto("/products/sample-polo-shirt");
    await page.locator('label:has(input[name="color"])').first().click();
    await page.locator('label:has(input[name="size"]):not(:has(input:disabled))').first().click();
    await page.getByRole("button", { name: "Add to Bag" }).click();
    expect(await violations(page), "bag drawer open").toEqual([]);
    await page.getByRole("link", { name: "Checkout" }).click();
    await page.waitForURL("**/checkout");
    await page.waitForLoadState("networkidle");
    expect(await violations(page)).toEqual([]);
  });

  for (const path of adminPages) {
    test(`admin ${path}`, async ({ page }) => {
      await adminLogin(page);
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await violations(page)).toEqual([]);
    });
  }
});

test.describe("keyboard and focus", () => {
  test("the first Tab stop is a 'skip to main content' link that works", async ({ page }) => {
    await page.goto("/shop");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: /skip to main content/i });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("the bag drawer keeps keyboard focus inside and closes with Escape", async ({ page }) => {
    await page.goto("/products/sample-polo-shirt");
    await page.locator('label:has(input[name="color"])').first().click();
    await page.locator('label:has(input[name="size"]):not(:has(input:disabled))').first().click();
    await page.getByRole("button", { name: "Add to Bag" }).click();
    const drawer = page.getByRole("dialog", { name: /bag/i });
    await expect(drawer).toBeVisible();
    // Focus may go to the browser's own controls at the end of the dialog, but never to the page behind it.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest("dialog"))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("every form field on the checkout has a label", async ({ page }) => {
    await page.goto("/products/sample-polo-shirt");
    await page.locator('label:has(input[name="color"])').first().click();
    await page.locator('label:has(input[name="size"]):not(:has(input:disabled))').first().click();
    await page.getByRole("button", { name: "Add to Bag" }).click();
    await page.getByRole("link", { name: "Checkout" }).click();
    await page.waitForURL("**/checkout");
    const unlabeled = await page.locator("input:not([type=hidden]):not([tabindex='-1']), select, textarea").evaluateAll((els) =>
      els.filter((e) => !(e as HTMLInputElement).labels?.length && !e.getAttribute("aria-label") && !e.getAttribute("aria-labelledby")).map((e) => e.outerHTML.slice(0, 100)),
    );
    expect(unlabeled).toEqual([]);
  });
});

test.describe("responsive layout: nothing scrolls sideways", () => {
  for (const width of [360, 414, 768, 1024, 1440]) {
    test(`storefront at ${width}px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ["/", "/shop", "/products/sample-polo-shirt", "/cart", "/contact", "/track"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(over, `${path} overflows by ${over}px`).toBeLessThanOrEqual(0);
      }
    });
  }

  for (const width of [360, 768, 1280]) {
    test(`admin at ${width}px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await adminLogin(page);
      for (const path of ["/admin", "/admin/products", "/admin/orders", "/admin/settings", "/admin/products/new"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(over, `${path} overflows by ${over}px`).toBeLessThanOrEqual(0);
      }
    });
  }

  test("on a phone the menu opens as a panel and the admin menu is reachable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("dialog").getByRole("link", { name: /shop all/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await adminLogin(page);
    await page.goto("/admin");
    await page.getByRole("button", { name: "Open admin menu" }).click();
    await expect(page.getByRole("dialog", { name: "Admin menu" }).getByRole("link", { name: "Orders" })).toBeVisible();
  });
});
