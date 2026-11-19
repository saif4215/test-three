import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actor, cleanDbPerTest, customer, makeProduct, openShop, setFlags } from "./helpers";
import { startFakeStripe, type FakeStripe } from "./stand-ins/stripe";
import { startFakeSmtp, type FakeSmtp } from "./stand-ins/smtp";
import { query } from "../src/lib/db";

cleanDbPerTest();

let stripe: FakeStripe;
let smtp: FakeSmtp;

beforeAll(async () => {
  const { handleStripeWebhook } = await import("../src/lib/payments/stripe");
  stripe = await startFakeStripe(async (payload, signature) => (await handleStripeWebhook(payload, signature)).status);
  smtp = await startFakeSmtp();
  Object.assign(process.env, {
    STRIPE_API_BASE: stripe.url,
    STRIPE_SECRET_KEY: stripe.secretKey,
    STRIPE_WEBHOOK_SECRET: stripe.webhookSecret,
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtp.port),
    SMTP_USER: smtp.user,
    SMTP_PASS: smtp.pass,
    SMTP_SECURE: "0",
    EMAIL_FROM: "Store <store@example.org>",
  });
});
afterAll(async () => {
  await stripe.close();
  await smtp.close();
  for (const k of ["STRIPE_API_BASE", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE", "EMAIL_FROM"]) delete process.env[k];
});

async function onlineOrder(priceCents = 2500, stock = 5) {
  await openShop();
  const { verifyIntegration } = await import("../src/lib/integrations");
  const { setFeatureFlags } = await import("../src/lib/settings");
  expect((await verifyIntegration("stripe")).ok).toBe(true);
  await setFeatureFlags({ online_payments: true }, actor);
  const { placeOrder } = await import("../src/lib/orders/create");
  const { createCheckoutSession } = await import("../src/lib/payments/stripe");
  const p = await makeProduct({ priceCents, variants: [{ size: "M", stock }] });
  const o = await placeOrder({ mode: "online", items: [{ variantId: p.variants[0].id, quantity: 2 }], name: customer.name, email: customer.email }, { customerId: null });
  const url = await createCheckoutSession({ id: o.orderId, orderNumber: o.orderNumber, email: customer.email, totalCents: o.totalCents, itemCount: 2 });
  const session = stripe.sessions[stripe.sessions.length - 1];
  return { o, url, session, variantId: p.variants[0].id };
}

const orderRow = async (id: string) => (await query<{ status: string; payment_status: string; stripe_session_id: string | null }>("select status, payment_status, stripe_session_id from orders where id = $1", [id])).rows[0];

describe("Stripe (against a stand-in): gated until a real test call works", () => {
  it("online payments can't be switched on before Stripe is verified", async () => {
    const { setFeatureFlags, FeatureError } = await import("../src/lib/settings");
    await expect(setFeatureFlags({ online_payments: true }, actor)).rejects.toBeInstanceOf(FeatureError);
  });

  it("reports a wrong secret key plainly and a malformed webhook secret as a warning", async () => {
    const { verifyStripe } = await import("../src/lib/payments/stripe");
    expect((await verifyStripe()).ok).toBe(true);
    process.env.STRIPE_SECRET_KEY = "sk_test_wrong";
    const bad = await verifyStripe();
    expect(bad.ok).toBe(false);
    expect(bad.detail).toMatch(/rejected/i);
    process.env.STRIPE_SECRET_KEY = stripe.secretKey;
    process.env.STRIPE_WEBHOOK_SECRET = "not-a-webhook-secret";
    expect((await verifyStripe()).detail).toMatch(/whsec_/);
    process.env.STRIPE_WEBHOOK_SECRET = stripe.webhookSecret;
  });
});

describe("Stripe: paying for an order", () => {
  it("asks Stripe for exactly the server-computed total and confirms the order only after a signed webhook", async () => {
    const { o, url, session } = await onlineOrder(2500);
    expect(o.totalCents).toBe(5000);
    expect(session.amount).toBe(5000);
    expect(url).toContain(session.id);
    expect((await orderRow(o.orderId)).status).toBe("awaiting_payment"); // visiting the page changes nothing
    expect(await stripe.send(session.id, "checkout.session.completed")).toBe(200);
    expect(await orderRow(o.orderId)).toMatchObject({ status: "confirmed", payment_status: "paid" });
  });

  it("rejects webhooks with a bad signature or no signature, and changes nothing", async () => {
    const { handleStripeWebhook } = await import("../src/lib/payments/stripe");
    const { o, session } = await onlineOrder();
    expect(await stripe.send(session.id, "checkout.session.completed", { badSignature: true })).toBe(400);
    expect((await handleStripeWebhook("{}", null)).status).toBe(400);
    expect((await orderRow(o.orderId)).payment_status).toBe("pending");
  });

  it("is idempotent when Stripe delivers the same event twice", async () => {
    const { o, session } = await onlineOrder();
    await stripe.send(session.id, "checkout.session.completed");
    await stripe.send(session.id, "checkout.session.completed");
    const events = await query("select 1 from order_events where order_id = $1 and note = 'Card payment received.'", [o.orderId]);
    expect(events.rowCount).toBe(1);
  });

  it("does not confirm when the amount paid differs from the order total, and leaves a note for staff", async () => {
    const { o, session } = await onlineOrder(2500);
    expect(await stripe.send(session.id, "checkout.session.completed", { amount: 100 })).toBe(200);
    expect(await orderRow(o.orderId)).toMatchObject({ status: "awaiting_payment", payment_status: "pending" });
    const note = await query<{ note: string }>("select note from order_events where order_id = $1 and note like 'Stripe reported%'", [o.orderId]);
    expect(note.rows[0].note).toMatch(/NOT marked paid/);
  });

  it("ignores events for sessions it never created", async () => {
    const { handleStripeWebhook } = await import("../src/lib/payments/stripe");
    const { o, session } = await onlineOrder();
    await query("update orders set stripe_session_id = 'cs_other' where id = $1", [o.orderId]);
    expect(await stripe.send(session.id, "checkout.session.completed")).toBe(200);
    expect((await orderRow(o.orderId)).payment_status).toBe("pending");
    void handleStripeWebhook;
  });

  it("an expired payment page cancels the order and puts the stock back", async () => {
    const { o, session, variantId } = await onlineOrder(2500, 5);
    const before = (await query<{ stock: number }>("select stock from product_variants where id = $1", [variantId])).rows[0].stock;
    expect(before).toBe(3);
    await stripe.send(session.id, "checkout.session.expired");
    expect(await orderRow(o.orderId)).toMatchObject({ status: "cancelled", payment_status: "failed" });
    expect((await query<{ stock: number }>("select stock from product_variants where id = $1", [variantId])).rows[0].stock).toBe(5);
  });

  it("a payment arriving after cancellation is flagged, not silently reopened", async () => {
    const { o, session } = await onlineOrder();
    await stripe.send(session.id, "checkout.session.expired");
    await stripe.send(session.id, "checkout.session.completed");
    const row = await orderRow(o.orderId);
    expect(row.status).toBe("cancelled");
    expect(row.payment_status).toBe("paid");
    const note = await query<{ note: string }>("select note from order_events where order_id = $1 and note like 'A payment arrived after%'", [o.orderId]);
    expect(note.rowCount).toBe(1);
  });
});

describe("Email (against a stand-in SMTP server)", () => {
  it("verifies with real credentials and fails plainly with wrong ones", async () => {
    const { verifySmtp } = await import("../src/lib/email");
    expect((await verifySmtp()).ok).toBe(true);
    process.env.SMTP_PASS = "wrong";
    const bad = await verifySmtp();
    expect(bad.ok).toBe(false);
    expect(bad.detail).toMatch(/mail server/i);
    process.env.SMTP_PASS = smtp.pass;
  });

  it("sends nothing until email is verified and switched on", async () => {
    const { sendEmail } = await import("../src/lib/email");
    const before = smtp.messages.length;
    const r = await sendEmail({ to: "a@example.org", subject: "Hello", text: "Hi", html: "<p>Hi</p>" });
    expect(r).toMatchObject({ sent: false, skipped: true });
    expect(smtp.messages.length).toBe(before);
    expect((await query("select 1 from email_outbox")).rowCount).toBe(0);
  });

  it("sends order confirmations once switched on, and records every message in the outbox", async () => {
    const { verifyIntegration } = await import("../src/lib/integrations");
    const { setFeatureFlags } = await import("../src/lib/settings");
    await openShop();
    await verifyIntegration("email");
    await setFeatureFlags({ email_notifications: true }, actor);
    const { placeOrder } = await import("../src/lib/orders/create");
    const { notifyOrderPlaced } = await import("../src/lib/orders/notify");
    const p = await makeProduct({ variants: [{ size: "M", stock: 5 }] });
    const before = smtp.messages.length;
    const o = await placeOrder({ mode: "request", items: [{ variantId: p.variants[0].id, quantity: 1 }], name: customer.name, email: customer.email }, { customerId: null });
    await notifyOrderPlaced(o.orderId);
    const sent = smtp.messages.slice(before).find((m) => m.to.includes(customer.email));
    expect(sent).toBeTruthy();
    expect(sent!.subject).toContain(o.orderNumber);
    expect(sent!.body).toContain(o.orderNumber);
    expect((await query<{ status: string }>("select status from email_outbox where to_email = $1", [customer.email])).rows[0].status).toBe("sent");
  });

  it("a mail failure never breaks the caller and is kept for retry", async () => {
    const { verifyIntegration } = await import("../src/lib/integrations");
    const { setFeatureFlags } = await import("../src/lib/settings");
    const { sendEmail, retryFailedEmails } = await import("../src/lib/email");
    await verifyIntegration("email");
    await setFeatureFlags({ email_notifications: true }, actor);
    const port = smtp.port;
    await smtp.close(); // the mail server goes down; the configuration (and so the verification) is unchanged
    const r = await sendEmail({ to: "b@example.org", subject: "Will fail", text: "x", html: "<p>x</p>" });
    expect(r.sent).toBe(false);
    expect((await query<{ status: string }>("select status from email_outbox where to_email = 'b@example.org'")).rows[0].status).toBe("failed");
    smtp = await startFakeSmtp(port); // ...and comes back
    expect(await retryFailedEmails()).toBe(1);
    expect((await query<{ status: string }>("select status from email_outbox where to_email = 'b@example.org'")).rows[0].status).toBe("sent");
  });
});

void setFlags;
