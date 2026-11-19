import "server-only";
import { isFeatureOn } from "../settings";
import { rateLimit } from "../rate-limit";
import { getOrderByNumber, type OrderEventRow, type OrderItemRow, type OrderRow } from "./queries";
import { verifyTrackingCode } from "./tracking-code";

/** What a customer may see. No email address, phone number or internal notes ever appear here. */
export interface PublicOrderView {
  orderNumber: string;
  mode: OrderRow["mode"];
  status: OrderRow["status"];
  paymentStatus: OrderRow["payment_status"];
  placedAt: Date;
  fulfillmentLabel: string;
  students: OrderRow["students"];
  items: OrderItemRow[];
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  totalCents: number;
  /** Staff notes are not shown, but the customer-facing steps are. */
  events: Pick<OrderEventRow, "to_status" | "created_at">[];
  customerName: string;
}

export type TrackResult = { ok: true; view: PublicOrderView } | { ok: false; reason: "disabled" | "limited" | "notfound" };

/**
 * Order number + private code. Wrong guesses are rate limited per address, and a missing order and a wrong code look the
 * same, so nobody can discover which order numbers exist.
 */
export async function trackOrder(orderNumber: string, code: string, ipKey: string): Promise<TrackResult> {
  if (!(await isFeatureOn("order_tracking"))) return { ok: false, reason: "disabled" };
  const rl = await rateLimit(`track:${ipKey}`, 30, 600);
  if (!rl.ok) return { ok: false, reason: "limited" };
  const found = await getOrderByNumber(orderNumber);
  if (!found || !code || !verifyTrackingCode(found.order.id, code) || found.order.access_expires_at < new Date()) return { ok: false, reason: "notfound" };
  const o = found.order;
  return {
    ok: true,
    view: {
      orderNumber: o.order_number,
      mode: o.mode,
      status: o.status,
      paymentStatus: o.payment_status,
      placedAt: o.created_at,
      fulfillmentLabel: o.fulfillment_label,
      students: o.students,
      items: found.items,
      subtotalCents: o.subtotal_cents,
      discountCents: o.discount_cents,
      feeCents: o.fulfillment_fee_cents,
      totalCents: o.total_cents,
      events: found.events.map((e) => ({ to_status: e.to_status, created_at: e.created_at })),
      customerName: o.customer_name,
    },
  };
}
