import { expect, test } from "@playwright/test";
import { accounts, adminLogin } from "./helpers";

test.describe("site check (the owner's plain-language health page)", () => {
  test("the owner sees each check with a plain status, and the optional services", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/site-check");
    await expect(page.getByRole("heading", { name: "Site check", level: 1 })).toBeVisible();
    for (const title of ["Database", "Site address", "Picture storage", "Automatic housekeeping"]) {
      await expect(page.getByRole("heading", { name: title, level: 3 })).toBeVisible();
    }
    // Everything here is wired correctly in the test store, so nothing may be marked as needing a fix.
    await expect(page.getByText("Needs fixing")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Database", level: 3 }).locator("..").getByText("OK")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Optional services" })).toBeVisible();
    for (const label of ["Email", "Card payments", "Google", "AI"]) {
      await expect(page.getByRole("listitem").filter({ hasText: new RegExp(label, "i") }).first()).toBeVisible();
    }
  });

  test("it is reachable from the menu under More, and Check again reloads it", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin");
    const nav = page.getByRole("navigation", { name: "Admin" });
    await nav.getByText("More", { exact: true }).click();
    await nav.getByRole("link", { name: "Site check", exact: true }).click();
    await page.waitForURL("**/admin/site-check");
    await page.getByRole("link", { name: "Check again" }).click();
    await expect(page.getByRole("heading", { name: "Site check", level: 1 })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Site check", exact: true })).toHaveAttribute("aria-current", "page");
  });

  test("only the owner can open it", async ({ browser }) => {
    for (const who of [accounts.manager, accounts.staff]) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await adminLogin(page, who);
      await page.goto("/admin/site-check");
      await expect(page).toHaveURL(/\/admin\/forbidden/);
      await ctx.close();
    }
  });
});
