import "server-only";
import { query } from "../db";
import type { OrderMode, OrderStatus } from "./status";
import type { Student } from "./create";

export interface OrderRow {
  id: string;
  order_number: string;
  mode: OrderMode;
  status: OrderStatus;
  payment_status: "none" | "pending" | "paid" | "failed" | "refunded" | "manual";
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  notes: string;
  students: Student[];
  fulfillment_id: string;
  fulfillment_label: string;
  fulfillment_fee_cents: number;
  promotion_code: string | null;
  discount_cents: number;
  subtotal_cents: number;
  total_cents: number;
  customer_id: string | null;
  internal_notes: string;
  stripe_session_id: string | null;
  access_expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface OrderItemRow {
  id: string;
  variant_id: string | null;
  product_id: string | null;
  product_name: string;
  variant_label: string;
  sku: string;
  unit_price_cents: number;
  quantity: number;
  image: { storage_key: string; widths: number[] } | null;
  slug: string | null;
}

export interface OrderEventRow {
  id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  note: string;
  actor_label: string;
  created_at: Date;
}

const ORDER_COLS = `o.id, o.order_number, o.mode, o.status, o.payment_status, o.customer_name, o.customer_email, o.customer_phone, o.notes, o.students,
  o.fulfillment_id, o.fulfillment_label, o.fulfillment_fee_cents, o.promotion_code, o.discount_cents, o.subtotal_cents, o.total_cents, o.customer_id,
  o.internal_notes, o.stripe_session_id, o.access_expires_at, o.created_at, o.updated_at`;

export async function getOrder(id: string): Promise<{ order: OrderRow; items: OrderItemRow[]; events: OrderEventRow[] } | null> {
  const o = await query<OrderRow>(`select ${ORDER_COLS} from orders o where o.id = $1`, [id]);
  if (!o.rowCount) return null;
  return { order: o.rows[0], ...(await loadDetails(id)) };
}

export async function getOrderByNumber(orderNumber: string): Promise<{ order: OrderRow; items: OrderItemRow[]; events: OrderEventRow[] } | null> {
  const o = await query<OrderRow>(`select ${ORDER_COLS} from orders o where upper(o.order_number) = upper($1)`, [orderNumber.trim()]);
  if (!o.rowCount) return null;
  return { order: o.rows[0], ...(await loadDetails(o.rows[0].id)) };
}

async function loadDetails(id: string) {
  const [items, events] = await Promise.all([
    query<OrderItemRow>(
      `select i.id, i.variant_id, i.product_id, i.product_name, i.variant_label, i.sku, i.unit_price_cents, i.quantity, p.slug,
              case when a.id is null then null else jsonb_build_object('storage_key', a.storage_key, 'widths', a.widths) end as image
         from order_items i left join media_assets a on a.id = i.image_asset_id left join products p on p.id = i.product_id and p.status = 'published'
        where i.order_id = $1 order by i.product_name, i.variant_label`,
      [id],
    ),
    query<OrderEventRow>("select id, from_status, to_status, note, actor_label, created_at from order_events where order_id = $1 order by created_at, id", [id]),
  ]);
  return { items: items.rows, events: events.rows };
}

export interface OrderListFilters {
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface OrderListRow extends OrderRow {
  item_count: number;
}

export async function listOrders(f: OrderListFilters = {}) {
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where: string[] = [];
  if (f.status && f.status !== "all") where.push(`o.status = ${p(f.status)}`);
  if (f.q?.trim()) {
    const like = p(`%${f.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    where.push(`(o.order_number ilike ${like} or o.customer_name ilike ${like} or o.customer_email ilike ${like} or o.customer_phone ilike ${like}
      or exists (select 1 from jsonb_array_elements(o.students) s where s->>'name' ilike ${like} or s->>'grade' ilike ${like}))`);
  }
  const pageSize = Math.min(f.pageSize ?? 25, 100);
  const page = Math.max(f.page ?? 1, 1);
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const total = Number((await query<{ n: string }>(`select count(*) as n from orders o ${w}`, params)).rows[0].n);
  const items = (
    await query<OrderListRow>(
      `select ${ORDER_COLS}, (select coalesce(sum(quantity), 0) from order_items i where i.order_id = o.id)::int as item_count
         from orders o ${w} order by o.created_at desc limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params,
    )
  ).rows;
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function orderStatusCounts(): Promise<Record<string, number>> {
  const r = await query<{ status: string; n: number }>("select status, count(*)::int as n from orders group by status");
  return Object.fromEntries(r.rows.map((x) => [x.status, x.n]));
}

/** Orders a signed-in customer can see: ones placed while signed in, and guest orders that used the same verified email. */
export async function ordersForCustomer(customerId: string, email: string) {
  return (
    await query<OrderRow & { item_count: number }>(
      `select ${ORDER_COLS}, (select coalesce(sum(quantity), 0) from order_items i where i.order_id = o.id)::int as item_count
         from orders o where o.customer_id = $1 or lower(o.customer_email) = lower($2) order by o.created_at desc limit 50`,
      [customerId, email],
    )
  ).rows;
}
