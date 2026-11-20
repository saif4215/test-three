import { describe, expect, it } from "vitest";
import { actor, customer, makeProduct, openShop, patchSettings, setFlags, cleanDbPerTest } from "./helpers";
import { placeOrder, normalizeStudents } from "../src/lib/orders/create";
import { quoteCart } from "../src/lib/orders/quote";
import { addInternalNote, changeOrderStatus, markOrderPaid, recordManualPayment, cancelAbandonedOnlineOrders } from "../src/lib/orders/manage";
import { deriveTrackingCode, verifyTrackingCode } from "../src/lib/orders/tracking-code";
import { getOrder, listOrders, ordersForCustomer } from "../src/lib/orders/queries";
import { canMove, allowedNext } from "../src/lib/orders/status";
import { savePromotion } from "../src/lib/promotions";
import { query } from "../src/lib/db";

cleanDbPerTest();

const order = (variantId: string, quantity = 1, extra: Record<string, unknown> = {}) => ({
  mode: "request" as const,
  items: [{ variantId, quantity }],
  name: customer.name,
  email: customer.email,
  ...extra,
});

const stock = async (variantId: string) => (await query<{ stock: number }>("select stock from product_variants where id = $1", [variantId])).rows[0].stock;

describe("pricing is decided on the server", () => {
  it("prices from the database, merges duplicate lines and caps to stock", async () => {
    await openShop();
    const p = await makeProduct({ priceCents: 2000, salePriceCents: 1500, variants: [{ size: "M", stock: 3 }] });
    const v = p.variants[0].id;
    const q = await quoteCart([{ variantId: v, quantity: 2 }, { variantId: v, quantity: 2 }]);
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]).toMatchObject({ quantity: 4, unitPriceCents: 1500, originalUnitPriceCents: 2000, onSale: true });
    expect(q.ok).toBe(false);
    expect(q.issues[0]).toMatch(/Only 3/);
    const ok = await quoteCart([{ variantId: v, quantity: 2 }]);
    expect(ok).toMatchObject({ ok: true, subtotalCents: 3000, totalCents: 3000 });
  });

  it("drops options that are unpublished or inactive", async () => {
    await openShop();
    const live = await makeProduct({ name: "Live" });
    const draft = await makeProduct({ name: "Draft", status: "draft" });
    const q = await quoteCart([{ variantId: live.variants[0].id, quantity: 1 }, { variantId: draft.variants[0].id, quantity: 1 }]);
    expect(q.lines.map((l) => l.name)).toEqual(["Live"]);
  });

  it("applies pickup/delivery fees and discount codes", async () => {
    await openShop();
    await setFlags({ promotions: true });
    await patchSettings({ fulfillmentMethods: [{ id: "pickup", label: "Pickup", type: "pickup", feeCents: 0, instructions: "", enabled: true }, { id: "ship", label: "Delivery", type: "delivery", feeCents: 500, instructions: "", enabled: true }] });
    await savePromotion({ code: "SAVE10", kind: "percent", value: 10 }, actor);
    const p = await makeProduct({ priceCents: 2000, variants: [{ stock: 9 }] });
    const q = await quoteCart([{ variantId: p.variants[0].id, quantity: 2 }], { promoCode: "save10", fulfillmentId: "ship" });
    expect(q).toMatchObject({ subtotalCents: 4000, discountCents: 400, feeCents: 500, totalCents: 4100, promoCode: "SAVE10" });
    const bad = await quoteCart([{ variantId: p.variants[0].id, quantity: 1 }], { promoCode: "NOPE" });
    expect(bad.promoError).toMatch(/isn’t valid/);
    expect(bad.discountCents).toBe(0);
  });
});

describe("placing an order", () => {
  it("takes stock, snapshots prices and starts as a pending request", async () => {
    await openShop();
    const p = await makeProduct({ name: "Polo", priceCents: 2000, variants: [{ size: "M", color: "Navy", stock: 5 }] });
    const placed = await placeOrder(order(p.variants[0].id, 2));
    expect(placed.orderNumber).toMatch(/^ICSI-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(await stock(p.variants[0].id)).toBe(3);
    const o = (await getOrder(placed.orderId))!;
    expect(o.order).toMatchObject({ status: "pending", payment_status: "none", subtotal_cents: 4000, total_cents: 4000, mode: "request" });
    expect(o.items[0]).toMatchObject({ product_name: "Polo", variant_label: "M / Navy", unit_price_cents: 2000, quantity: 2 });
    // The price on the order stays even if the price changes later.
    await query("update products set price_cents = 9900");
    expect((await getOrder(placed.orderId))!.items[0].unit_price_cents).toBe(2000);
  });

  it("cannot oversell: two buyers, one item", async () => {
    await openShop();
    const p = await makeProduct({ variants: [{ size: "M", stock: 1 }] });
    const results = await Promise.allSettled([placeOrder(order(p.variants[0].id)), placeOrder(order(p.variants[0].id, 1, { email: "other@example.com" }))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await stock(p.variants[0].id)).toBe(0);
    expect((await query("select count(*) from orders")).rows[0].count).toBe("1");
  });

  it("does not track stock for products that opt out", async () => {
    await openShop();
    const p = await makeProduct({ trackInventory: false, variants: [{ stock: 0 }] });
    await expect(placeOrder(order(p.variants[0].id, 3))).resolves.toBeTruthy();
    expect(await stock(p.variants[0].id)).toBe(0);
  });

  it("rejects bad input and saves nothing", async () => {
    await openShop();
    const p = await makeProduct({ variants: [{ stock: 2 }] });
    const v = p.variants[0].id;
    await expect(placeOrder(order(v, 1, { email: "not-an-email" }))).rejects.toThrow(/valid email/);
    await expect(placeOrder(order(v, 1, { name: "A" }))).rejects.toThrow(/name/);
    await expect(placeOrder(order(v, 5))).rejects.toThrow(/Only 2/);
    await expect(placeOrder({ ...order(v), items: [] })).rejects.toThrow(/empty/);
    expect((await query("select count(*) from orders")).rows[0].count).toBe("0");
    expect(await stock(v)).toBe(2);
  });

  it("is closed until the owner opens it", async () => {
    const p = await makeProduct();
    await expect(placeOrder(order(p.variants[0].id))).rejects.toThrow(/open yet|switched on/i);
    await openShop();
    await patchSettings({ orderWindow: { opensAt: null, closesAt: new Date(Date.now() - 3600_000).toISOString(), note: "" } });
    await expect(placeOrder(order(p.variants[0].id))).rejects.toThrow(/closed/i);
    await patchSettings({ orderWindow: { opensAt: null, closesAt: new Date(Date.now() + 3600_000).toISOString(), note: "" } });
    await expect(placeOrder(order(p.variants[0].id))).resolves.toBeTruthy();
  });

  it("requires the terms when the owner asks for it, and a phone when required", async () => {
    await openShop();
    await patchSettings({ requireTermsAcceptance: true, requirePhone: true });
    const p = await makeProduct();
    await expect(placeOrder(order(p.variants[0].id))).rejects.toThrow(/terms/);
    await expect(placeOrder(order(p.variants[0].id, 1, { acceptTerms: true }))).rejects.toThrow(/phone/);
    await expect(placeOrder(order(p.variants[0].id, 1, { acceptTerms: true, phone: "555-0100" }))).resolves.toBeTruthy();
  });

  it("makes the shopper choose when there are several pickup/delivery options", async () => {
    await openShop();
    await patchSettings({ fulfillmentMethods: [{ id: "a", label: "A", type: "pickup", feeCents: 0, instructions: "", enabled: true }, { id: "b", label: "B", type: "pickup", feeCents: 300, instructions: "", enabled: true }] });
    const p = await makeProduct({ priceCents: 1000 });
    await expect(placeOrder(order(p.variants[0].id))).rejects.toThrow(/Choose how/);
    const placed = await placeOrder(order(p.variants[0].id, 1, { fulfillmentId: "b" }));
    expect((await getOrder(placed.orderId))!.order).toMatchObject({ fulfillment_label: "B", fulfillment_fee_cents: 300, total_cents: 1300 });
  });
});

describe("student information", () => {
  it("is ignored when off, optional when optional, and complete when required", () => {
    expect(normalizeStudents("off", [{ name: "Ann", grade: "3" }])).toEqual([]);
    expect(normalizeStudents("optional", [{ name: "", grade: "" }])).toEqual([]);
    expect(normalizeStudents("optional", [{ name: "Ann", grade: "3A" }])).toEqual([{ name: "Ann", grade: "3A" }]);
    expect(() => normalizeStudents("optional", [{ name: "Ann", grade: "" }])).toThrow(/grade or class for Ann/);
    expect(() => normalizeStudents("required", [])).toThrow(/name and grade/);
    expect(normalizeStudents("required", [{ name: "Ann", grade: "3A" }, { name: "Bo", grade: "1" }])).toHaveLength(2);
  });

  it("is stored on the order and findable in the admin search", async () => {
    await openShop();
    await patchSettings({ studentInfo: "required" });
    const p = await makeProduct();
    await expect(placeOrder(order(p.variants[0].id))).rejects.toThrow(/student/);
    const placed = await placeOrder(order(p.variants[0].id, 1, { students: [{ name: "Amina Test", grade: "3A" }] }));
    expect((await getOrder(placed.orderId))!.order.students).toEqual([{ name: "Amina Test", grade: "3A" }]);
    expect((await listOrders({ q: "amina" })).total).toBe(1);
    expect((await listOrders({ q: "3A" })).total).toBe(1);
    expect((await listOrders({ q: "grade" })).total).toBe(0);
  });
});

describe("order status", () => {
  it("only allows sensible moves", () => {
    expect(canMove("pending", "confirmed")).toBe(true);
    expect(canMove("pending", "ready")).toBe(false);
    expect(canMove("completed", "cancelled")).toBe(false);
    expect(allowedNext("cancelled")).toEqual([]);
  });

  it("confirms, readies and completes, writing a history", async () => {
    await openShop();
    const p = await makeProduct();
    const placed = await placeOrder(order(p.variants[0].id));
    await changeOrderStatus(placed.orderId, "confirmed", actor, "Thanks!");
    await changeOrderStatus(placed.orderId, "ready", actor);
    await changeOrderStatus(placed.orderId, "completed", actor);
    const o = (await getOrder(placed.orderId))!;
    expect(o.order.status).toBe("completed");
    expect(o.events.map((e) => e.to_status)).toEqual(["pending", "confirmed", "ready", "completed"]);
    await expect(changeOrderStatus(placed.orderId, "cancelled", actor)).rejects.toThrow(/can’t be changed/);
  });

  it("cancelling puts the stock and the discount use back", async () => {
    await openShop();
    await setFlags({ promotions: true });
    await savePromotion({ code: "ONCE", kind: "fixed", value: 100, maxUses: 1 }, actor);
    const p = await makeProduct({ variants: [{ stock: 4 }] });
    const placed = await placeOrder(order(p.variants[0].id, 2, { promoCode: "ONCE" }));
    expect(await stock(p.variants[0].id)).toBe(2);
    await expect(placeOrder(order(p.variants[0].id, 1, { promoCode: "ONCE", email: "x@example.com" }))).rejects.toThrow(/maximum/);
    await changeOrderStatus(placed.orderId, "cancelled", actor, "Out of the colour");
    expect(await stock(p.variants[0].id)).toBe(4);
    await expect(placeOrder(order(p.variants[0].id, 1, { promoCode: "ONCE", email: "x@example.com" }))).resolves.toBeTruthy();
  });

  it("keeps staff notes out of the customer view and records manual payments once", async () => {
    await openShop();
    const p = await makeProduct();
    const placed = await placeOrder(order(p.variants[0].id));
    await addInternalNote(placed.orderId, "Called the parent", actor);
    await recordManualPayment(placed.orderId, actor, "Cash");
    await expect(recordManualPayment(placed.orderId, actor)).rejects.toThrow(/already/);
    const o = (await getOrder(placed.orderId))!;
    expect(o.order).toMatchObject({ internal_notes: "Called the parent", payment_status: "manual" });
  });
});

describe("online payments (state handling only; no card is charged in tests)", () => {
  async function onlineOrder() {
    await setFlags({ cart: true, online_payments: true });
    // The Stripe feature is gated on verification; fake the verified state the way a real Verify would.
    const { recordVerification } = await import("../src/lib/integrations");
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
    await recordVerification("stripe", true, "test");
    await patchSettings({ requireTermsAcceptance: false });
    const p = await makeProduct({ variants: [{ stock: 3 }] });
    const placed = await placeOrder({ ...order(p.variants[0].id, 2), mode: "online" });
    return { p, placed };
  }

  it("waits for payment, then confirms exactly once", async () => {
    const { placed } = await onlineOrder();
    expect((await getOrder(placed.orderId))!.order).toMatchObject({ status: "awaiting_payment", payment_status: "pending" });
    await expect(changeOrderStatus(placed.orderId, "confirmed", actor)).rejects.toThrow(/payment/);
    expect(await markOrderPaid(placed.orderId, "pi_1")).toBe("paid");
    expect(await markOrderPaid(placed.orderId, "pi_1")).toBe("already");
    expect((await getOrder(placed.orderId))!.order).toMatchObject({ status: "confirmed", payment_status: "paid" });
  });

  it("cancels abandoned payments and returns the stock", async () => {
    const { p, placed } = await onlineOrder();
    expect(await stock(p.variants[0].id)).toBe(1);
    await query("update orders set created_at = now() - interval '3 hours' where id = $1", [placed.orderId]);
    expect(await cancelAbandonedOnlineOrders(120)).toBe(1);
    expect(await stock(p.variants[0].id)).toBe(3);
    expect((await getOrder(placed.orderId))!.order.status).toBe("cancelled");
  });

  it("flags a payment that arrives after cancellation instead of silently reopening the order", async () => {
    const { placed } = await onlineOrder();
    await changeOrderStatus(placed.orderId, "cancelled", actor);
    expect(await markOrderPaid(placed.orderId, "pi_late")).toBe("late");
    const o = (await getOrder(placed.orderId))!;
    expect(o.order).toMatchObject({ status: "cancelled", payment_status: "paid" });
    expect(o.events.at(-1)!.note).toMatch(/Refund/);
  });
});

describe("tracking links", () => {
  it("are tied to one order and cannot be forged", async () => {
    await openShop();
    const p = await makeProduct();
    const a = await placeOrder(order(p.variants[0].id));
    const b = await placeOrder(order(p.variants[0].id, 1, { email: "b@example.com" }));
    const code = deriveTrackingCode(a.orderId);
    expect(code).toMatch(/^[a-z0-9]{20}$/);
    expect(verifyTrackingCode(a.orderId, code)).toBe(true);
    expect(verifyTrackingCode(b.orderId, code)).toBe(false);
    expect(verifyTrackingCode(a.orderId, "a".repeat(20))).toBe(false);
    expect(verifyTrackingCode(a.orderId, "")).toBe(false);
    expect(a.trackPath).toBe(`/track/${a.orderNumber}?code=${code}`);
  });
});

describe("a customer's own orders", () => {
  it("include orders linked to their account and guest orders with the same email", async () => {
    await openShop();
    const p = await makeProduct({ variants: [{ stock: 9 }] });
    const c = (await query<{ id: string }>("insert into customers (google_sub, email, name) values ('sub-1', 'pat@example.com', 'Pat') returning id")).rows[0].id;
    await placeOrder(order(p.variants[0].id), { customerId: c });
    await placeOrder(order(p.variants[0].id, 1, { email: "PAT@example.com" }));
    await placeOrder(order(p.variants[0].id, 1, { email: "someone-else@example.com" }));
    expect(await ordersForCustomer(c, "pat@example.com")).toHaveLength(2);
  });
});
