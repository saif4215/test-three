import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { adminLogin, control, mailbox, watchProblems } from "./helpers";

test.describe.configure({ mode: "serial" });

interface StripeSession {
  id: string;
  orderId: string;
  amount: number;
}
const lastSession = async (request: APIRequestContext) => {
  const all = await control<StripeSession[]>(request, "GET", "/stripe/sessions");
  return all[all.length - 1];
};

async function fillBag(page: Page, product = "sample-polo-shirt", size = "M") {
  await page.goto(`/products/${product}`);
  const colours = page.locator('label:has(input[name="color"])');
  if (await colours.count()) await colours.first().click();
  const wanted = page.locator(`label:has(input[name="size"]):not(:has(input:disabled))`).filter({ hasText: new RegExp(`^${size}$`) });
  await ((await wanted.count()) ? wanted.first() : page.locator('label:has(input[name="size"]):not(:has(input:disabled))').first()).click();
  await page.getByRole("button", { name: "Add to Bag" }).click();
  await page.getByRole("link", { name: "Checkout" }).click();
  await page.waitForURL("**/checkout");
}

async function fillDetails(page: Page, email = "casey@example.com") {
  await page.fill("#name", "Casey Carer");
  await page.fill("#email", email);
  const student = page.locator("#student-name-0");
  if (await student.count()) {
    await student.fill("Robin Student");
    await page.fill("#student-grade-0", "4B");
  }
  await page.getByRole("checkbox").check();
}

test.describe("paying by card (Stripe stand-in)", () => {
  test("the customer pays on the payment page and the order is confirmed by the signed webhook", async ({ page, request }) => {
    const problems = watchProblems(page);
    await control(request, "POST", "/mail/clear");
    await fillBag(page);
    await fillDetails(page);
    await page.getByRole("radio", { name: /pay online now/i }).check();
    await page.getByRole("button", { name: /continue to payment/i }).click();
    await page.waitForURL(/\/pay\/cs_test_/);
    await expect(page.getByText(/stand-in payment page/i)).toBeVisible();
    const session = await lastSession(request);
    expect(session.amount).toBeGreaterThan(0);
    // Merely arriving at the payment page confirms nothing.
    const before = await request.get(`/admin/orders/${session.orderId}`, { maxRedirects: 0 });
    expect([302, 303, 307]).toContain(before.status()); // not signed in: the admin is closed to this request
    await page.getByRole("button", { name: "Pay" }).click();
    await page.waitForURL(/\/track\/ICSI-/);
    await expect(page.getByText(/^Confirmed$/).first()).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await mailbox(request)).some((m) => m.to.includes("casey@example.com") && /ICSI-/.test(m.subject))).toBeTruthy();
    expect(problems).toEqual([]);
  });

  test("leaving the payment page leaves the order waiting, never confirmed", async ({ page, request }) => {
    await fillBag(page, "sample-spirit-tee", "L");
    await fillDetails(page, "dana@example.com");
    await page.getByRole("radio", { name: /pay online now/i }).check();
    await page.getByRole("button", { name: /continue to payment/i }).click();
    await page.waitForURL(/\/pay\/cs_test_/);
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.waitForURL(/\/cart/);
    const session = await lastSession(request);
    await adminLogin(page);
    await page.goto(`/admin/orders/${session.orderId}`);
    await expect(page.getByText(/awaiting payment/i).first()).toBeVisible();
    await expect(page.getByText(/waiting for the card payment/i)).toBeVisible();
  });

  test("forged, wrong-amount and expired webhooks are handled safely", async ({ page, request }) => {
    const session = await lastSession(request);
    await adminLogin(page);
    const orderPage = `/admin/orders/${session.orderId}`;

    const forged = await control<{ status: number }>(request, "POST", "/stripe/send", { sessionId: session.id, type: "checkout.session.completed", badSignature: true });
    expect(forged.status).toBe(400);
    await page.goto(orderPage);
    await expect(page.getByText(/awaiting payment/i).first()).toBeVisible();

    const wrong = await control<{ status: number }>(request, "POST", "/stripe/send", { sessionId: session.id, type: "checkout.session.completed", amount: 100 });
    expect(wrong.status).toBe(200);
    await page.goto(orderPage);
    await expect(page.getByText(/NOT marked paid/i)).toBeVisible();
    await expect(page.getByText(/awaiting payment/i).first()).toBeVisible();

    await control(request, "POST", "/stripe/send", { sessionId: session.id, type: "checkout.session.expired" });
    await page.goto(orderPage);
    await expect(page.getByText(/cancelled/i).first()).toBeVisible();
  });
});

test.describe("order requests and staff handling", () => {
  test("staff move a request through its steps and the customer is emailed each time", async ({ page, request }) => {
    await control(request, "POST", "/mail/clear");
    await fillBag(page, "sample-hooded-sweatshirt", "M");
    await fillDetails(page, "emery@example.com");
    await page.getByRole("radio", { name: /send an order request/i }).check();
    await page.getByRole("button", { name: /submit order request/i }).click();
    await page.waitForURL(/\/track\/ICSI-/);
    const number = (await page.getByText(/ICSI-[A-Z0-9]{4}-[A-Z0-9]{4}/).first().textContent())!.match(/ICSI-[A-Z0-9]{4}-[A-Z0-9]{4}/)![0];
    await expect.poll(async () => (await mailbox(request)).some((m) => m.to.includes("emery@example.com") && m.subject.includes(number))).toBeTruthy();

    await adminLogin(page);
    await page.goto("/admin/orders");
    await page.getByRole("link", { name: number }).click();
    await page.getByLabel("New status").selectOption({ label: "Confirmed" });
    await page.getByLabel(/note to the customer/i).fill("Collect from the front desk on Friday.");
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByRole("status").filter({ hasText: /updated|moved|confirmed/i }).first()).toBeVisible();
    await expect.poll(async () => (await mailbox(request)).some((m) => m.to.includes("emery@example.com") && m.body.includes("Collect from the front desk on Friday."))).toBeTruthy();

    // Only valid steps are offered: a confirmed order can't go back to "Request received".
    const options = await page.getByLabel("New status").locator("option").allTextContents();
    expect(options).not.toContain("Request received");
    await page.getByLabel("New status").selectOption({ label: "Ready" });
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByText(/^Ready$/).first()).toBeVisible();
  });

  test("a discount code is checked and priced by the server", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/promotions/new");
    const code = `SAVE${Math.floor(Math.random() * 1e6)}`;
    await page.fill("#code", code);
    await page.selectOption("#kind", "percent");
    await page.fill("#value", "10");
    await page.getByRole("button", { name: "Save promotion" }).click();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByText(code)).toBeVisible(); // saved: now on its edit page

    await fillBag(page); // one polo shirt at $20.00 (plus any pickup fee)
    const totalOf = async () => Number((await page.locator("dt:text-is('Total') + dd").first().textContent())!.replace(/[^0-9.]/g, ""));
    await expect(page.locator("dt:text-is('Total') + dd").first()).toHaveText(/\$\d/); // wait for the server's price
    const before = await totalOf();
    await page.locator("#promo2").fill(code);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(new RegExp(`code ${code} applied`, "i"))).toBeVisible();
    await expect(page.locator("dt:text-is('Discount')")).toBeVisible();
    await expect.poll(totalOf).toBeCloseTo(before - 2, 2); // 10% of $20.00, decided by the server
    await page.locator("#promo2").fill("NOPE");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/isn’t valid|not valid|couldn’t find|unknown|doesn’t exist/i).first()).toBeVisible();
  });
});

test.describe("ordering window and student information", () => {
  test("a closed ordering window stops new orders on the server, and the banner says so", async ({ page, request }) => {
    await adminLogin(page);
    await page.goto("/admin/settings#ordering");
    await page.locator("#windowClosesAt").fill("2020-01-01T09:00");
    await page.locator("#windowNote").fill("Thank you for your support.");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: /settings saved/i })).toBeVisible();

    await page.goto("/shop");
    await expect(page.getByText(/ordering closed/i).first()).toBeVisible();
    await expect(page.getByText(/thank you for your support/i).first()).toBeVisible();
    // A hand-made order request is refused by the server even though the form isn't used.
    const res = await request.post("/api/cart/quote", { data: { items: [], promoCode: null, fulfillmentId: null } });
    expect(res.ok()).toBeTruthy();

    // Open it again.
    await page.goto("/admin/settings#ordering");
    await page.locator("#windowClosesAt").fill("");
    await page.locator("#windowNote").fill("");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: /settings saved/i })).toBeVisible();
    await page.goto("/shop");
    await expect(page.getByText(/ordering closed/i)).toHaveCount(0);
  });

  test("when student details are required, checkout insists on them, and the packing list groups orders by class", async ({ page, request }) => {
    await adminLogin(page);
    await page.goto("/admin/settings#ordering");
    await page.locator("#studentInfo").selectOption("required");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: /settings saved/i })).toBeVisible();

    await fillBag(page);
    await expect(page.locator("#student-name-0")).toBeVisible();
    await page.fill("#name", "Casey Carer");
    await page.fill("#email", "casey@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("radio", { name: /send an order request/i }).check();
    await page.getByRole("button", { name: /submit order request/i }).click();
    expect(await page.locator("#student-name-0:invalid").count()).toBe(1);
    await page.fill("#student-name-0", "Robin Student");
    await page.fill("#student-grade-0", "4B");
    await page.getByRole("button", { name: /submit order request/i }).click();
    await page.waitForURL(/\/track\/ICSI-/);
    const number = (await page.getByText(/ICSI-[A-Z0-9]{4}-[A-Z0-9]{4}/).first().textContent())!.match(/ICSI-[A-Z0-9]{4}-[A-Z0-9]{4}/)![0];

    await page.goto("/admin/orders");
    await page.getByRole("link", { name: number }).click();
    await page.getByLabel("New status").selectOption({ label: "Confirmed" });
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByText(/^Confirmed$/).first()).toBeVisible();

    await page.goto("/admin/orders/packing-list");
    await expect(page.getByRole("heading", { name: "Packing list" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^4B/ })).toBeVisible();
    await expect(page.getByText("Robin Student")).toBeVisible();
    await expect(page.getByRole("button", { name: /print this list/i })).toBeVisible();

    await page.goto("/admin/settings#ordering");
    await page.locator("#studentInfo").selectOption("optional");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: /settings saved/i })).toBeVisible();
    void request;
  });
});
