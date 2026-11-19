import { expect, test } from "@playwright/test";
import { accounts, adminLogin, alertOf, control, mailbox, PASSWORD } from "./helpers";

test.describe.configure({ mode: "serial" });

import sharp from "sharp";

// A real picture, made on the spot (and a one-pixel one, which is too small to use).
let PNG: Buffer;
let TINY: Buffer;
test.beforeAll(async () => {
  PNG = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#336699" } }).png().toBuffer();
  TINY = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#336699" } }).png().toBuffer();
});

test.describe("team management", () => {
  const stamp = Math.random().toString(36).slice(2, 8);
  const email = `newbie-${stamp}@example.org`;
  const temp = "Temp-Passw0rd-2026!";
  const mine = "My-Own-Passw0rd-2026!";

  test("the owner adds a team member; their first sign-in forces a new password", async ({ page, browser }) => {
    await adminLogin(page);
    await page.goto("/admin/team");
    await page.fill("#m-name", "Nia Newbie");
    await page.fill("#m-email", email);
    await page.selectOption("#m-role", "staff");
    await page.fill("#m-pw", temp);
    await page.getByRole("button", { name: "Add team member" }).click();
    await expect(page.getByRole("status").first()).toBeVisible();
    await expect(page.locator("tr", { hasText: email })).toBeVisible();

    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await adminLogin(p, email, temp, { fresh: true });
    await expect(p).toHaveURL(/\/admin\/account\?required=1/);
    // Nothing else opens until the password is changed.
    await p.goto("/admin/orders");
    await expect(p).toHaveURL(/\/admin\/account/);
    await p.fill("#current", temp);
    await p.fill("#password", "short");
    await p.fill("#confirm", "short");
    await p.getByRole("button", { name: /change password|save/i }).click();
    expect(await p.locator("#password:invalid").count()).toBe(1); // too short: stopped by the form
    await p.fill("#password", "password1234");
    await p.fill("#confirm", "password1234");
    await p.getByRole("button", { name: /change password|save/i }).click();
    await expect(alertOf(p).first()).toBeVisible(); // a common password: refused by the server with a reason
    await p.fill("#current", temp);
    await p.fill("#password", mine);
    await p.fill("#confirm", mine);
    await p.getByRole("button", { name: /change password|save/i }).click();
    await p.waitForURL(/\/admin(\/)?$/);
    await p.goto("/admin/orders");
    await expect(p).toHaveURL(/\/admin\/orders/);
    await ctx.close();
  });

  test("revoking access ends that person's session immediately", async ({ page, browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await adminLogin(p, email, mine, { fresh: true });
    await p.goto("/admin/orders");
    await expect(p).toHaveURL(/\/admin\/orders/);

    await adminLogin(page);
    await page.goto("/admin/team");
    page.once("dialog", (d) => void d.accept());
    await page.locator("tr", { hasText: email }).getByRole("button", { name: "Revoke access" }).click();
    await expect(page.locator("tr", { hasText: email }).getByRole("button", { name: /restore/i })).toBeVisible();

    await p.goto("/admin/orders");
    await expect(p).toHaveURL(/\/admin\/login/);
    await p.getByLabel("Email").fill(email);
    await p.getByLabel("Password").fill(mine);
    await p.getByRole("button", { name: /^sign in$/i }).click();
    await expect(alertOf(p).first()).toBeVisible();
    await ctx.close();
  });

  test("an administrator (not owner) manages the shop but not settings or the team", async ({ browser }) => {
    const ctx = await browser.newContext();
    const m = await ctx.newPage();
    await adminLogin(m, accounts.manager);
    for (const path of ["/admin/products", "/admin/content", "/admin/promotions", "/admin/analytics", "/admin/ai"]) {
      await m.goto(path);
      await expect(m, path).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
    }
    for (const path of ["/admin/settings", "/admin/team"]) {
      await m.goto(path);
      await expect(m, path).toHaveURL(/\/admin\/forbidden/);
    }
    await ctx.close();
  });
});

test.describe("writing assistant (Anthropic stand-in)", () => {
  test("drafts from the facts typed in, shows a review warning, and never sends contact details", async ({ page, request }) => {
    await control(request, "POST", "/anthropic/reply", { text: "A soft cotton tee in navy. [add price]" });
    await adminLogin(page);
    await page.goto("/admin/ai");
    await page.selectOption("#task", "product_description");
    await page.fill("#notes", "Cotton tee, navy, adult sizes S to XL");
    await page.getByRole("button", { name: "Write a draft" }).click();
    await expect(page.getByLabel("AI draft")).toHaveValue(/soft cotton tee in navy/i);
    await expect(page.getByText(/check every fact, price and date/i)).toBeVisible();
    const bodies = await control<{ messages: { content: string }[]; system: string }[]>(request, "GET", "/anthropic/bodies");
    const last = bodies[bodies.length - 1];
    expect(last.messages[0].content).toContain("Cotton tee, navy");
    expect(last.system).toMatch(/Never invent prices/);

    const count = bodies.length;
    await page.fill("#notes", "Email jane.doe@example.org about the tee");
    await page.getByRole("button", { name: "Write a draft" }).click();
    await expect(alertOf(page).first()).toContainText(/remove email addresses/i);
    expect((await control<unknown[]>(request, "GET", "/anthropic/bodies")).length).toBe(count);
  });

  test("staff cannot use it", async ({ browser }) => {
    const ctx = await browser.newContext();
    const s = await ctx.newPage();
    await adminLogin(s, accounts.staff);
    await s.goto("/admin/ai");
    await expect(s).toHaveURL(/\/admin\/forbidden/);
    await ctx.close();
  });
});

test.describe("back-in-stock alerts (email stand-in)", () => {
  test("a shopper asks to be told, confirms by email, and nobody is emailed without confirming", async ({ page, request }) => {
    await control(request, "POST", "/mail/clear");
    await page.goto("/products/sample-crewneck-sweatshirt");
    const sold = page.locator('label:has(input[name="size"])').first();
    if (await page.locator('label:has(input[name="color"])').count()) await page.locator('label:has(input[name="color"])').first().click();
    await sold.click();
    await page.locator("#restock-email").fill("waiting@example.com");
    // Nothing is sent unless the shopper actually agrees.
    await page.getByRole("button", { name: "Notify me" }).click();
    expect((await mailbox(request)).some((m) => m.to.includes("waiting@example.com"))).toBe(false);
    await page.getByRole("checkbox", { name: /i agree to receive one email/i }).check();
    await page.getByRole("button", { name: "Notify me" }).click();
    await expect(page.getByText(/check your email|confirm/i).first()).toBeVisible();
    await expect.poll(async () => (await mailbox(request)).some((m) => m.to.includes("waiting@example.com"))).toBeTruthy();
    const mail = (await mailbox(request)).find((m) => m.to.includes("waiting@example.com"))!;
    const link = /https?:\/\/[^\s"'<>]*\/restock\/verify\?token=[A-Za-z0-9]+/.exec(mail.body)?.[0];
    expect(link, "the email must contain a confirmation link").toBeTruthy();
    await page.goto(link!);
    await expect(page.getByText(/confirmed|you.?ll be emailed|all set/i).first()).toBeVisible();
    // A made-up token confirms nothing.
    await page.goto("/restock/verify?token=made-up-token");
    await expect(page.getByText(/confirmed|all set/i)).toHaveCount(0);
  });
});

test.describe("uploads", () => {
  test("only signed-in editors can upload, and only real pictures are accepted", async ({ page, request }) => {
    const anon = await request.post("/api/admin/uploads", { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: PNG }, kind: "upload" }, headers: { origin: process.env.E2E_BASE_URL ?? "http://localhost:3100" } });
    expect(anon.status()).toBe(401);

    await adminLogin(page);
    const origin = process.env.E2E_BASE_URL ?? "http://localhost:3100";
    const post = (name: string, mimeType: string, buffer: Buffer) => page.request.post("/api/admin/uploads", { multipart: { file: { name, mimeType, buffer }, kind: "upload" }, headers: { origin } });

    const ok = await post("pic.png", "image/png", PNG);
    expect(ok.status()).toBe(200);
    const body = (await ok.json()) as { id: string; url: string };
    expect(body.url).toMatch(/^\/(media|uploads|api)/);
    const served = await page.request.get(body.url);
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toMatch(/^image\//);
    expect(served.headers()["x-content-type-options"]).toBe("nosniff");

    const tiny = await post("tiny.png", "image/png", TINY);
    expect(tiny.status()).toBe(400);
    expect(((await tiny.json()) as { error: string }).error).toMatch(/too small/i);
    expect((await post("evil.png", "image/png", Buffer.from("<html><script>alert(1)</script></html>"))).status()).toBe(400);
    expect((await post("evil.svg", "image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).status()).toBe(400);
    expect((await post("big.png", "image/png", Buffer.concat([PNG, Buffer.alloc(11 * 1024 * 1024)]))).status()).toBeGreaterThanOrEqual(400);

    // A different website can't make the browser upload on the owner's behalf.
    const cross = await page.request.post("/api/admin/uploads", { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: PNG }, kind: "upload" }, headers: { origin: "https://evil.example.com" } });
    expect(cross.status()).toBe(403);
    void PASSWORD;
  });
});
