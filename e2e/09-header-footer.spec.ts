import { expect, test, type Page } from "@playwright/test";
import { adminLogin } from "./helpers";

/**
 * The header and footer when the store has everything switched on: three categories, Collections, Uniforms and Sale.
 * That is the longest row of links the header ever has to hold, so it is the one that used to spill off the screen.
 */
const WIDTHS = [1280, 1366, 1440, 1536, 1920];
const COLLECTION_TITLE = "E2E Layout Collection";

async function makeEverythingAppear(page: Page): Promise<string> {
  await adminLogin(page);
  // A published collection (adds "Collections" to the header).
  await page.goto("/admin/collections/new");
  await page.fill("#title", COLLECTION_TITLE);
  await page.selectOption("#status", "published");
  await page.fill("#pfilter", "Sample Polo");
  await page.getByLabel("Sample Polo Shirt").check();
  await page.getByRole("button", { name: "Save collection" }).click();
  await page.waitForURL(/\/admin\/collections\/[0-9a-f-]{36}/);
  const collectionPath = new URL(page.url()).pathname;
  // A product in the Uniforms category (adds "Uniforms" to the header and makes the Uniforms category link a duplicate).
  await page.goto("/admin/products");
  await page.getByRole("link", { name: "Sample Polo Shirt" }).first().click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Uniforms", { exact: true }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /saved/i }).first()).toBeVisible();
  return collectionPath;
}

async function putThingsBack(page: Page, collectionPath: string) {
  await adminLogin(page);
  await page.goto("/admin/products");
  await page.getByRole("link", { name: "Sample Polo Shirt" }).first().click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Uniforms", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /saved/i }).first()).toBeVisible();
  await page.goto(collectionPath);
  await page.waitForLoadState("networkidle");
  await page.selectOption("#status", "draft");
  await page.getByRole("button", { name: "Save collection" }).click();
  await page.waitForLoadState("networkidle");
}

test.describe.serial("header and footer with every link present", () => {
  let collectionPath = "";

  test("set up: a collection and a uniform product exist", async ({ page }) => {
    collectionPath = await makeEverythingAppear(page);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Collections" })).toBeAttached();
    await expect(nav.getByRole("link", { name: "Uniforms" })).toBeAttached();
    await expect(nav.getByRole("link", { name: "Sale" })).toBeAttached();
  });

  for (const width of WIDTHS) {
    test(`the header fits on a ${width}px screen: bag and favourites stay in view, links stop before the search box`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      const nav = page.getByRole("navigation", { name: "Main" });
      await expect(nav.getByRole("link", { name: "Shop all" })).toBeVisible();

      const bag = page.getByRole("link", { name: /^Bag/ });
      await expect(bag).toBeVisible();
      const bagBox = (await bag.boundingBox())!;
      expect(bagBox.x + bagBox.width, "bag icon is on screen").toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), "page scrolls sideways").toBeLessThanOrEqual(0);

      const rights = await nav.getByRole("link").evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect().right));
      const search = (await page.locator("#search-header").boundingBox())!;
      expect(Math.max(...rights), "main links end before the search box starts").toBeLessThanOrEqual(search.x);

      // The third category only joins the row when there is room for it.
      const third = nav.getByRole("link", { name: "Accessories" });
      if (width >= 1536) await expect(third).toBeVisible();
      else await expect(third).toBeHidden();
    });
  }

  test("the footer lists Uniforms once, not as both a category and a page", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Uniforms" })).toHaveCount(1);
    await expect(footer.locator('a[href="/uniforms"]')).toHaveCount(1);
    await expect(footer.locator('a[href="/category/uniforms"]')).toHaveCount(0);
    // The other categories are still listed.
    await expect(footer.getByRole("link", { name: "Accessories" })).toBeVisible();
  });

  test("put things back for the rest of the suite", async ({ page }) => {
    await putThingsBack(page, collectionPath);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Collections" })).toHaveCount(0);
  });
});
