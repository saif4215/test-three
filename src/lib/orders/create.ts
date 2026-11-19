import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import { tx } from "../db";
import { UserError } from "../errors";
import { newOrderNumber } from "../crypto";
import { getFeatures, loadStoreSettings, orderingStatus, type StoreSettings } from "../settings";
import { cartItemsSchema, priceCart, type Quote } from "./quote";
import { trackingPath } from "./tracking-code";

export const studentSchema = z.object({ name: z.string().trim().max(80), grade: z.string().trim().max(40) });
export type Student = z.infer<typeof studentSchema>;

export const checkoutSchema = z.object({
  mode: z.enum(["request", "online"]),
  items: cartItemsSchema.min(1, "Your bag is empty."),
  promoCode: z.string().trim().max(60).nullable().optional(),
  fulfillmentId: z.string().trim().max(40).nullable().optional(),
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(254),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
  acceptTerms: z.boolean().optional(),
  students: z.array(studentSchema).max(5).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/**
 * Applies the owner's student-information setting. "off" stores nothing, even if a browser sends names;
 * "required" needs at least one student with BOTH a name and a grade/class.
 */
export function normalizeStudents(setting: StoreSettings["studentInfo"], students: Student[] | undefined): Student[] {
  if (setting === "off") return [];
  const filled = (students ?? []).filter((s) => s.name || s.grade);
  for (const s of filled) {
    if (!s.name) throw new UserError("Please enter the student’s name.");
    if (!s.grade) throw new UserError(`Please enter the grade or class for ${s.name}.`);
  }
  if (setting === "required" && filled.length === 0) throw new UserError("Please enter the student’s name and grade or class.");
  return filled;
}

export interface PlacedOrder {
  orderId: string;
  orderNumber: string;
  mode: "request" | "online";
  totalCents: number;
  trackPath: string;
  customerEmail: string;
}

async function insertOrder(c: PoolClient, args: { orderNumber: string; input: CheckoutInput; quote: Quote; students: Student[]; trackingDays: number; customerId: string | null }): Promise<string> {
  const { input, quote } = args;
  const online = input.mode === "online";
  const r = await c.query<{ id: string }>(
    `insert into orders (order_number, mode, status, payment_status, customer_name, customer_email, customer_phone, notes, students,
        fulfillment_id, fulfillment_label, fulfillment_fee_cents, promotion_code, discount_cents, subtotal_cents, total_cents, customer_id, access_expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now() + make_interval(days => $18)) returning id`,
    [
      args.orderNumber, input.mode, online ? "awaiting_payment" : "pending", online ? "pending" : "none", input.name, input.email, input.phone ?? "", input.notes ?? "",
      JSON.stringify(args.students), quote.chosenFulfillment?.id ?? "", quote.chosenFulfillment?.label ?? "", quote.feeCents, quote.promoCode, quote.discountCents,
      quote.subtotalCents, quote.totalCents, args.customerId, args.trackingDays,
    ],
  );
  return r.rows[0].id;
}

/**
 * Places an order. Everything that matters happens in ONE transaction: the options are locked, prices are recomputed from
 * the database, stock is taken, and the order is written. If anything is wrong nothing at all is saved.
 */
export async function placeOrder(raw: unknown, opts: { customerId?: string | null } = {}): Promise<PlacedOrder> {
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  const input = parsed.data;
  const [features, settings] = await Promise.all([getFeatures(), loadStoreSettings()]);

  const status = orderingStatus(features, settings);
  if (!status.open) throw new UserError(status.message ?? "Ordering isn’t available right now.");
  if (!status.modes.includes(input.mode)) throw new UserError(input.mode === "online" ? "Online payment isn’t available right now." : "Order requests aren’t available right now.");
  if (settings.requireTermsAcceptance && !input.acceptTerms) throw new UserError("Please accept the terms to continue.");
  if (settings.requirePhone && !input.phone) throw new UserError("Please enter a phone number.");
  const students = normalizeStudents(settings.studentInfo, input.students);
  const enabled = settings.fulfillmentMethods.filter((m) => m.enabled);
  if (enabled.length > 1 && !enabled.some((m) => m.id === input.fulfillmentId)) throw new UserError("Choose how you’d like to receive your order.");

  return tx(async (c) => {
    const quote = await priceCart(c, input.items, { features, settings }, { promoCode: input.promoCode, fulfillmentId: input.fulfillmentId, forUpdate: true });
    if (quote.lines.length === 0) throw new UserError("Those items are no longer available.");
    if (quote.issues.length) throw new UserError(quote.issues[0]);
    if (quote.promoError && input.promoCode?.trim()) throw new UserError(quote.promoError);

    // Take the stock (the rows are locked, so no one else can take the same last item).
    for (const l of quote.lines) {
      const tracked = await c.query<{ track_inventory: boolean }>("select p.track_inventory from products p where p.id = $1", [l.productId]);
      if (tracked.rows[0]?.track_inventory) {
        const upd = await c.query("update product_variants set stock = stock - $2 where id = $1 and stock >= $2", [l.variantId, l.quantity]);
        if (!upd.rowCount) throw new UserError(`${l.name} just sold out. Please update your bag.`);
      }
    }
    if (quote.promoCode) await c.query("update promotions set used_count = used_count + 1 where upper(code) = upper($1)", [quote.promoCode]);

    let orderId = "";
    let orderNumber = "";
    for (let attempt = 0; attempt < 6; attempt++) {
      orderNumber = newOrderNumber();
      try {
        await c.query("savepoint order_number");
        orderId = await insertOrder(c, { orderNumber, input, quote, students, trackingDays: settings.trackingLinkDays, customerId: opts.customerId ?? null });
        await c.query("release savepoint order_number");
        break;
      } catch (e) {
        await c.query("rollback to savepoint order_number");
        if ((e as { code?: string }).code !== "23505" || attempt === 5) throw e;
      }
    }
    for (const l of quote.lines) {
      await c.query(
        `insert into order_items (order_id, variant_id, product_id, product_name, variant_label, sku, unit_price_cents, quantity, image_asset_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [orderId, l.variantId, l.productId, l.name, l.variantLabel, l.sku, l.unitPriceCents, l.quantity, l.imageAssetId],
      );
    }
    await c.query("insert into order_events (order_id, from_status, to_status, note, actor_label) values ($1, null, $2, $3, 'customer')", [
      orderId,
      input.mode === "online" ? "awaiting_payment" : "pending",
      input.mode === "online" ? "Order started; waiting for payment." : "Order request received.",
    ]);
    return { orderId, orderNumber, mode: input.mode, totalCents: quote.totalCents, trackPath: trackingPath(orderNumber, orderId), customerEmail: input.email };
  });
}
