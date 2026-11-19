import { expect, test } from "@playwright/test";
import { adminLogin, watchProblems } from "./helpers";

test.describe.configure({ mode: "serial" });

const unique = () => Math.random().toString(36).slice(2, 8);
const saved = (page: import("@playwright/test").Page) => page.getByRole("status").filter({ hasText: /^(Saved|.*saved)/i }).first();

test.describe("products", () => {
  const stamp = unique();
  const name = `E2E Scarf ${stamp}`;
  const slug = `e2e-scarf-${stamp}`;

  test("create a product with sizes and stock: it stays hidden until published", async ({ page }) => {
    const problems = watchProblems(page);
    await adminLogin(page);
    await page.goto("/admin/products/new");
    await page.fill("#name", name);
    await page.fill("#price", "18");
    await page.fill("#gen-sizes", "S, M");
    await page.fill("#gen-colours", "Red");
    await page.getByRole("button", { name: "Add all combinations" }).click();
    await page.getByLabel("Stock, option 1").fill("4");
    await page.getByLabel("Stock, option 2").fill("0");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(saved(page)).toBeVisible();

    const hidden = await page.request.get(`/products/${slug}`);
    expect(hidden.status(), "a draft must not be public").toBe(404);
    const listed = await page.request.get(`/shop?q=${slug}`);
    expect(await listed.text()).not.toContain(name);

    await page.getByRole("button", { name: /save & publish/i }).click();
    // The "Saved." note from the first save is still on screen, so wait for the public page itself to change.
    await expect.poll(async () => (await page.request.get(`/products/${slug}`)).status()).toBe(200);
    expect(await (await page.request.get(`/products/${slug}`)).text()).toContain(name);
    expect(problems).toEqual([]);
  });

  test("the live product shows its stock honestly: a sold-out size can't be chosen", async ({ page }) => {
    await page.goto(`/products/e2e-scarf-${stamp}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByRole("radio", { name: "M (sold out)" })).toHaveCount(1);
    await expect(page.getByRole("radio", { name: "S", exact: true })).toHaveCount(1);
    await expect(page.getByText("$18.00").first()).toBeVisible();
    // Choosing the sold-out size doesn't let it into the bag.
    await page.locator('label:has(input[name="size"][value="M"])').click();
    await expect(page.getByRole("button", { name: "Add to Bag" })).toHaveCount(0);
    await expect(page.getByText(/sold out|out of stock|notify me/i).first()).toBeVisible();
  });

  test("a sale price shows the original struck through, and unpublishing hides the product again", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/products");
    await page.getByRole("link", { name }).first().click();
    await page.waitForLoadState("networkidle"); // let the editor finish loading before touching its fields
    await page.fill("#sale", "12");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => (await (await page.request.get(`/products/${slug}`)).text()).includes("$12.00")).toBeTruthy();
    await page.goto(`/products/${slug}`);
    await expect(page.getByText("$12.00").first()).toBeVisible();
    await expect(page.locator("s, del, [class*=line-through]").filter({ hasText: "$18.00" }).first()).toBeVisible();

    await page.goto("/admin/products");
    await page.getByRole("link", { name }).first().click();
    await page.waitForLoadState("networkidle");
    await page.selectOption("#status", "archived");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => (await page.request.get(`/products/${slug}`)).status()).toBe(404);
  });

  test("markup typed into a product name is shown as text, never run", async ({ page }) => {
    const dialogs: string[] = [];
    page.on("dialog", async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });
    const evil = `<img src=x onerror=alert(1)> <script>alert(2)</script> ${unique()}`;
    await adminLogin(page);
    await page.goto("/admin/products/new");
    await page.fill("#name", evil);
    await page.fill("#price", "5");
    await page.getByRole("button", { name: /save & publish/i }).click();
    await expect(saved(page)).toBeVisible();
    await page.goto(`/shop?q=${encodeURIComponent("img src")}`);
    await page.goto("/shop");
    await page.waitForTimeout(500);
    const html = await page.content();
    expect(html).not.toMatch(/<img[^>]+onerror/i);
    expect(html).not.toContain("<script>alert(2)</script>");
    expect(dialogs).toEqual([]);
    await page.goto("/admin/products");
    await page.waitForTimeout(300);
    expect(dialogs).toEqual([]);
  });
});

test.describe("spreadsheet import", () => {
  const stamp = unique();
  test("a bad file is rejected line by line and nothing is imported", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/products/import");
    await page.locator("#import-text").fill("name,price,size,stock\n,abc,M,-3\n");
    await page.getByRole("button", { name: "Check file" }).click();
    await expect(page.getByText(/Line 2/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Import/ })).toBeDisabled();
  });

  test("a good file becomes DRAFT products only, and editing it after checking forces a re-check", async ({ page }) => {
    const csv = `name,category,price,size,color,stock\nE2E Import Tee ${stamp},Shirts & Polos,14.50,S,Blue,3\nE2E Import Tee ${stamp},Shirts & Polos,14.50,M,Blue,5\n`;
    await adminLogin(page);
    await page.goto("/admin/products/import");
    await page.locator("#import-text").fill(csv);
    await page.getByRole("button", { name: "Check file" }).click();
    await expect(page.getByText(/will be created as/i).first()).toBeVisible();
    await expect(page.getByText(/drafts/i).first()).toBeVisible();
    await page.locator("#import-text").fill(`${csv}extra,Shirts & Polos,1,M,Red,1\n`);
    await expect(page.getByText(/check it again before importing/i)).toBeVisible();
    await page.locator("#import-text").fill(csv);
    await page.getByRole("button", { name: "Check file" }).click();
    await page.getByRole("button", { name: /^Import 1 product/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /import/i }).first()).toBeVisible();
    const res = await page.request.get(`/shop?q=${encodeURIComponent(`Import Tee ${stamp}`)}`);
    expect(await res.text()).not.toContain(`E2E Import Tee ${stamp}`);
    await page.goto("/admin/products");
    await expect(page.getByRole("link", { name: `E2E Import Tee ${stamp}` }).first()).toBeVisible();
  });

  test("spreadsheet formulas typed as customer details are neutralised in exports", async ({ page, request }) => {
    // Place an order whose name is a spreadsheet formula, then export orders as CSV.
    await page.goto("/products/sample-polo-shirt");
    await page.locator('label:has(input[name="color"])').first().click();
    await page.locator('label:has(input[name="size"]):not(:has(input:disabled))').first().click();
    await page.getByRole("button", { name: "Add to Bag" }).click();
    await page.getByRole("link", { name: "Checkout" }).click();
    await page.waitForURL("**/checkout");
    await page.fill("#name", '=HYPERLINK("http://evil.example","click")');
    await page.fill("#email", "formula@example.com");
    const s = page.locator("#student-name-0");
    if (await s.count()) {
      await s.fill("Kid");
      await page.fill("#student-grade-0", "1A");
    }
    await page.getByRole("checkbox").check();
    await page.getByRole("radio", { name: /send an order request/i }).check();
    await page.getByRole("button", { name: /submit order request/i }).click();
    await page.waitForURL(/\/track\/ICSI-/);

    await adminLogin(page);
    const res = await page.request.get("/api/admin/export/orders");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const csv = await res.text();
    expect(csv).toContain("formula@example.com");
    expect(csv).not.toMatch(/(^|,|\n)"?=HYPERLINK/);
    expect(csv).toMatch(/'=HYPERLINK/);
    void request;
  });
});

test.describe("homepage, policies and announcements", () => {
  test("homepage edits are a draft until published", async ({ page }) => {
    const headline = `E2E ${unique()}`.toUpperCase();
    await adminLogin(page);
    await page.goto("/admin/content");
    await page.locator("#hh").fill(headline);
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").first()).toBeVisible();
    expect(await (await page.request.get("/")).text()).not.toContain(headline);
    await page.getByRole("button", { name: /save & publish/i }).click();
    await expect.poll(async () => (await (await page.request.get("/")).text()).includes(headline)).toBeTruthy();
  });

  test("a policy page stays hidden until it has text AND is marked approved", async ({ page }) => {
    expect((await page.request.get("/policies/returns")).status()).toBe(404);
    await adminLogin(page);
    await page.goto("/admin/content/pages");
    const text = `E2E returns wording ${unique()}`;
    await page.locator("#b-returns").fill(text);
    const approved = page.locator("form", { has: page.getByRole("button", { name: "Save Returns" }) }).locator("input[name=approved]");
    await page.getByRole("button", { name: "Save Returns" }).click();
    await expect(page.getByRole("status").first()).toBeVisible();
    expect((await page.request.get("/policies/returns")).status(), "text alone isn't enough").toBe(404);
    await approved.check();
    await page.getByRole("button", { name: "Save Returns" }).click();
    await expect.poll(async () => (await page.request.get("/policies/returns")).status()).toBe(200);
    expect(await (await page.request.get("/policies/returns")).text()).toContain(text);
    // Unapprove again so the rest of the suite sees the default (hidden) state.
    await approved.uncheck();
    await page.getByRole("button", { name: "Save Returns" }).click();
    await expect.poll(async () => (await page.request.get("/policies/returns")).status()).toBe(404);
  });

  test("an announcement appears on the storefront, markup is escaped, and deleting removes it", async ({ page }) => {
    const title = `E2E notice ${unique()}`;
    await adminLogin(page);
    await page.goto("/admin/content/announcements/new");
    await page.fill("#title", `${title} <b>bold</b>`);
    await page.getByRole("button", { name: /save/i }).click();
    // (the breadcrumb is on this page before and after saving, so wait for the storefront itself to show the notice)
    await expect.poll(async () => (await (await page.request.get("/")).text()).includes(title)).toBeTruthy();
    const html = await (await page.request.get("/")).text();
    expect(html).not.toContain("<b>bold</b>");
    await page.goto("/admin/content/announcements");
    const row = page.locator("tr", { hasText: title });
    page.once("dialog", (d) => void d.accept());
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("tr", { hasText: title })).toHaveCount(0);
    await expect.poll(async () => (await (await page.request.get("/")).text()).includes(title)).toBeFalsy();
  });
});
