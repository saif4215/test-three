import { expect, test, type Page } from "@playwright/test";
import { adminLogin } from "./helpers";

const origin = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3100").origin;

/** Follows every same-site link breadth-first and records anything broken. */
async function crawl(page: Page, starts: string[], opts: { skip: RegExp; limit: number }) {
  const seen = new Set<string>();
  const queue = [...starts];
  const broken: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 200));
  });
  while (queue.length && seen.size < opts.limit) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    const status = res?.status() ?? 0;
    if (status >= 400) {
      broken.push(`${status} ${path}`);
      continue;
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    // Pictures that didn't load.
    const brokenImages = await page.locator("img").evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 0 && (i as HTMLImageElement).currentSrc).map((i) => (i as HTMLImageElement).currentSrc));
    for (const src of brokenImages) broken.push(`broken image ${src} on ${path}`);
    // Pages must have a title and exactly one h1.
    if (!(await page.title()).trim()) broken.push(`no <title> on ${path}`);
    const h1 = await page.locator("h1").count();
    if (h1 !== 1) broken.push(`${h1} <h1> elements on ${path}`);
    const hrefs = await page.locator("a[href]").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
    for (const h of hrefs) {
      const u = new URL(h);
      if (u.origin !== origin) {
        broken.push(`external link ${h} on ${path}`);
        continue;
      }
      const next = u.pathname + u.search;
      if (u.hash && !u.pathname) continue;
      if (opts.skip.test(next) || seen.has(next)) continue;
      queue.push(next);
    }
  }
  return { seen, broken, consoleErrors };
}

test("every public page and link works, has one heading and a title, and loads its pictures", async ({ page }) => {
  test.setTimeout(240_000);
  const { seen, broken, consoleErrors } = await crawl(page, ["/"], { skip: /^\/(admin|api|account|checkout|track\/|restock)|[?&](page|sort|q)=/, limit: 80 });
  expect(seen.size).toBeGreaterThan(15);
  expect(broken).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("every admin page the owner can reach opens without an error", async ({ page }) => {
  test.setTimeout(240_000);
  await adminLogin(page);
  const { seen, broken, consoleErrors } = await crawl(page, ["/admin"], { skip: /\/api\/|logout|\/admin\/login|\/admin\/orders\/packing-list\?|[?&](page|sort|q|status)=/, limit: 70 });
  expect(seen.size).toBeGreaterThan(15);
  // Admin pages that list records may legitimately link to a customer's tracking page, which lives on the public site.
  expect(broken.filter((b) => !b.startsWith("external link"))).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("the sitemap lists only public pages that really exist", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(urls.length).toBeGreaterThan(5);
  for (const u of urls) {
    const path = new URL(u).pathname;
    expect(path, "private pages must not be listed").not.toMatch(/^\/(admin|api|account|checkout|cart|track)/);
    expect((await request.get(path)).status(), path).toBe(200);
  }
  expect(xml).not.toMatch(/e2e-scarf/); // archived and draft products are not listed
});

test("a missing page gives a friendly 404 with a way back, not a stack trace", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("link", { name: /shop|home|back/i }).first()).toBeVisible();
  expect(await page.content()).not.toMatch(/at \w+ \(|node_modules|ECONNREFUSED/);
});
