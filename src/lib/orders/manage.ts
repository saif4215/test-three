import "server-only";
import { query, tx, type Db } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";
import { canMove, STATUS_LABELS, type OrderStatus } from "./status";
import { notifyCustomerOfStatus } from "./notify";

interface LockedOrder {
  id: string;
  status: OrderStatus;
  mode: "request" | "online";
  payment_status: string;
  promotion_code: string | null;
  order_number: string;
}

/** Gives the stock of a cancelled order back to the shelf and frees its discount code use. */
async function releaseOrder(c: Db, order: LockedOrder) {
  await c.query(
    `update product_variants v set stock = v.stock + i.quantity from order_items i
      where i.order_id = $1 and i.variant_id = v.id and exists (select 1 from products p where p.id = v.product_id and p.track_inventory)`,
    [order.id],
  );
  if (order.promotion_code) await c.query("update promotions set used_count = greatest(0, used_count - 1) where upper(code) = upper($1)", [order.promotion_code]);
}

export async function changeOrderStatus(orderId: string, to: OrderStatus, actor: Actor, note = "", ip: string | null = null): Promise<void> {
  const result = await tx(async (c) => {
    const cur = (await c.query<LockedOrder>("select id, status, mode, payment_status, promotion_code, order_number from orders where id = $1 for update", [orderId])).rows[0];
    if (!cur) throw new UserError("That order no longer exists.");
    if (cur.status === to) return null;
    if (!canMove(cur.status, to)) throw new UserError(`An order that is “${STATUS_LABELS[cur.status]}” can’t be changed to “${STATUS_LABELS[to]}”.`);
    if (cur.status === "awaiting_payment" && to === "confirmed" && !["paid", "manual"].includes(cur.payment_status)) {
      throw new UserError("This order is waiting for a card payment. Record the payment first, or wait for it to succeed.");
    }
    if (to === "cancelled") await releaseOrder(c, cur);
    await c.query("update orders set status = $2, updated_at = now() where id = $1", [orderId, to]);
    await c.query("insert into order_events (order_id, from_status, to_status, note, actor_id, actor_label) values ($1, $2, $3, $4, $5, $6)", [orderId, cur.status, to, note.slice(0, 500), actor.id, actor.label]);
    await audit(actor, "order.status", "order", orderId, { number: cur.order_number, from: cur.status, to }, ip, c);
    return cur;
  });
  if (result) await notifyCustomerOfStatus(orderId, to, note);
}

export async function addInternalNote(orderId: string, note: string, actor: Actor, ip: string | null = null): Promise<void> {
  const r = await query("update orders set internal_notes = $2, updated_at = now() where id = $1", [orderId, note.slice(0, 2000)]);
  if (!r.rowCount) throw new UserError("That order no longer exists.");
  await audit(actor, "order.note", "order", orderId, {}, ip);
}

/** An administrator received money in person (cash, cheque, a school account...). */
export async function recordManualPayment(orderId: string, actor: Actor, note = "", ip: string | null = null): Promise<void> {
  await tx(async (c) => {
    const cur = (await c.query<{ status: OrderStatus; payment_status: string; order_number: string }>("select status, payment_status, order_number from orders where id = $1 for update", [orderId])).rows[0];
    if (!cur) throw new UserError("That order no longer exists.");
    if (cur.status === "cancelled") throw new UserError("This order was cancelled.");
    if (cur.payment_status === "paid" || cur.payment_status === "manual") throw new UserError("A payment is already recorded for this order.");
    await c.query("update orders set payment_status = 'manual', updated_at = now() where id = $1", [orderId]);
    await c.query("insert into order_events (order_id, from_status, to_status, note, actor_id, actor_label) values ($1, $2, $2, $3, $4, $5)", [orderId, cur.status, `Payment recorded by staff${note ? `: ${note.slice(0, 300)}` : "."}`, actor.id, actor.label]);
    await audit(actor, "order.payment", "order", orderId, { number: cur.order_number }, ip, c);
  });
}

/** Called when Stripe confirms a card payment. Safe to call more than once for the same payment. */
export async function markOrderPaid(orderId: string, paymentIntent: string | null): Promise<"paid" | "already" | "late"> {
  const out = await tx(async (c) => {
    const cur = (await c.query<{ status: OrderStatus; payment_status: string }>("select status, payment_status from orders where id = $1 for update", [orderId])).rows[0];
    if (!cur) return "already" as const;
    if (cur.payment_status === "paid") return "already" as const;
    if (cur.status === "cancelled") {
      await c.query("update orders set payment_status = 'paid', stripe_payment_intent = $2, updated_at = now() where id = $1", [orderId, paymentIntent]);
      await c.query("insert into order_events (order_id, from_status, to_status, note, actor_label) values ($1, 'cancelled', 'cancelled', $2, 'stripe')", [orderId, "A payment arrived after this order was cancelled. Refund it in Stripe, or reopen the order by hand."]);
      return "late" as const;
    }
    await c.query("update orders set payment_status = 'paid', stripe_payment_intent = $2, status = case when status = 'awaiting_payment' then 'confirmed' else status end, updated_at = now() where id = $1", [orderId, paymentIntent]);
    await c.query("insert into order_events (order_id, from_status, to_status, note, actor_label) values ($1, $2, $3, 'Card payment received.', 'stripe')", [orderId, cur.status, cur.status === "awaiting_payment" ? "confirmed" : cur.status]);
    return "paid" as const;
  });
  if (out === "paid") await notifyCustomerOfStatus(orderId, "confirmed", "Card payment received.");
  return out;
}

/** Online orders that were started but never paid are cancelled after a while, so their stock goes back on sale. */
export async function cancelAbandonedOnlineOrders(minutes = 120): Promise<number> {
  const stale = (await query<{ id: string }>("select id from orders where status = 'awaiting_payment' and payment_status = 'pending' and created_at < now() - make_interval(mins => $1) limit 50", [minutes])).rows;
  let n = 0;
  for (const o of stale) {
    try {
      await changeOrderStatus(o.id, "cancelled", { id: null, label: "system" }, "Payment wasn’t completed in time.");
      n++;
    } catch {
      /* someone else changed it first: fine */
    }
  }
  return n;
}
