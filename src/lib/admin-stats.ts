import "server-only";
import { query } from "./db";
import { SALE_STATUSES } from "./orders/status";

const SALES = SALE_STATUSES.map((s) => `'${s}'`).join(", ");

export interface DashboardData {
  products: { total: number; published: number; drafts: number };
  stock: { outOfStock: number; lowStock: number };
  orders: { pending: number; open: number; confirmed30: number; revenue30Cents: number };
}

export async function dashboardData(defaultThreshold: number): Promise<DashboardData> {
  const [p, s, o] = await Promise.all([
    query<{ total: number; published: number; drafts: number }>(
      "select count(*)::int as total, count(*) filter (where status = 'published')::int as published, count(*) filter (where status = 'draft')::int as drafts from products where status <> 'archived' or true",
    ),
    query<{ out_of_stock: number; low_stock: number }>(
      `select count(*) filter (where p.status = 'published' and p.track_inventory and not exists (select 1 from product_variants v2 where v2.product_id = p.id and v2.active and v2.stock > 0))::int as out_of_stock,
              (select count(*) from product_variants v join products p2 on p2.id = v.product_id where p2.status = 'published' and p2.track_inventory and v.active and v.stock > 0 and v.stock <= coalesce(v.low_stock_threshold, p2.low_stock_threshold, $1))::int as low_stock
         from products p`,
      [defaultThreshold],
    ),
    query<{ pending: number; open: number; confirmed30: number; revenue30: number }>(
      `select count(*) filter (where status in ('pending', 'awaiting_payment'))::int as pending,
              count(*) filter (where status in ('pending', 'awaiting_payment', 'confirmed', 'ready'))::int as open,
              count(*) filter (where status in (${SALES}) and created_at > now() - interval '30 days')::int as confirmed30,
              coalesce(sum(total_cents) filter (where status in (${SALES}) and created_at > now() - interval '30 days'), 0)::int as revenue30
         from orders`,
    ),
  ]);
  return {
    products: p.rows[0],
    stock: { outOfStock: s.rows[0].out_of_stock, lowStock: s.rows[0].low_stock },
    orders: { pending: o.rows[0].pending, open: o.rows[0].open, confirmed30: o.rows[0].confirmed30, revenue30Cents: o.rows[0].revenue30 },
  };
}

export interface SalesDay {
  day: string;
  orders: number;
  revenueCents: number;
}

/** Confirmed/ready/completed orders per day (in the store's time zone). A request nobody accepted is not a sale. */
export async function salesByDay(days: number, timezone: string): Promise<SalesDay[]> {
  const r = await query<{ day: string; orders: number; revenue: number }>(
    `select to_char(d::date, 'YYYY-MM-DD') as day,
            coalesce(count(o.id), 0)::int as orders, coalesce(sum(o.total_cents), 0)::int as revenue
       from generate_series((now() at time zone $2)::date - ($1::int - 1), (now() at time zone $2)::date, interval '1 day') d
       left join orders o on (o.created_at at time zone $2)::date = d::date and o.status in (${SALES})
      group by d order by d`,
    [days, timezone],
  );
  return r.rows.map((x) => ({ day: x.day, orders: x.orders, revenueCents: x.revenue }));
}

export async function bestSellers(days: number, limit = 10) {
  return (
    await query<{ name: string; quantity: number; revenue: number }>(
      `select i.product_name as name, sum(i.quantity)::int as quantity, sum(i.quantity * i.unit_price_cents)::int as revenue
         from order_items i join orders o on o.id = i.order_id
        where o.status in (${SALES}) and o.created_at > now() - make_interval(days => $1)
        group by i.product_name order by quantity desc, revenue desc limit $2`,
      [days, limit],
    )
  ).rows;
}

export async function ordersByStatus() {
  return (await query<{ status: string; n: number }>("select status, count(*)::int as n from orders group by status order by n desc")).rows;
}

export async function recentActivity(limit = 6) {
  return (await query<{ id: string; action: string; actor_label: string; created_at: Date; detail: Record<string, unknown> }>("select id::text, action, actor_label, created_at, detail from audit_log order by created_at desc limit $1", [limit])).rows;
}

export async function recentOrders(limit = 6) {
  return (await query<{ id: string; order_number: string; customer_name: string; total_cents: number; status: string; created_at: Date }>("select id, order_number, customer_name, total_cents, status, created_at from orders order by created_at desc limit $1", [limit])).rows;
}

/** Pretty text for an activity-log action code. */
export function describeAction(a: string, detail: Record<string, unknown> = {}): string {
  const name = typeof detail.name === "string" ? ` “${detail.name}”` : typeof detail.code === "string" ? ` ${detail.code}` : typeof detail.number === "string" ? ` ${detail.number}` : "";
  const map: Record<string, string> = {
    "auth.login": "Signed in",
    "auth.login_google": "Signed in with Google",
    "auth.login_failed": "Failed sign-in attempt",
    "auth.logout": "Signed out",
    "auth.password_changed": "Changed their password",
    "auth.reset_requested": "Asked for a password reset",
    "auth.reset_completed": "Reset a password",
    "auth.setup": "Created the first Owner",
    "settings.update": "Updated store settings",
    "features.update": `Changed feature switches${Array.isArray(detail.on) && detail.on.length ? `: on ${detail.on.join(", ")}` : ""}${Array.isArray(detail.off) && detail.off.length ? `; off ${detail.off.join(", ")}` : ""}`,
    "integration.verify": `Verified ${String(detail.service ?? "a service")}: ${detail.ok ? "success" : "failed"}`,
    "product.create": `Created product${name}`,
    "product.update": `Updated product${name}`,
    "product.publish": "Published a product",
    "product.unpublish": "Unpublished a product",
    "product.archive": "Archived a product",
    "product.duplicate": "Duplicated a product",
    "product.delete": `Deleted product${name}`,
    "sample.add": `Added ${String(detail.count ?? "")} sample products`,
    "sample.remove": `Removed ${String(detail.products ?? "")} sample products`,
    "product.import": `Imported ${String(detail.created ?? 0)} products as drafts from a spreadsheet`,
    "inventory.set": `Changed stock${name ? ` of${String(detail.product ? ` “${detail.product}”` : "")}` : ""}: ${String(detail.from)} → ${String(detail.to)}`,
    "order.status": `Order${name}: ${String(detail.from)} → ${String(detail.to)}`,
    "order.payment": `Recorded a payment${name ? ` for order${name}` : ""}`,
    "order.note": "Added an order note",
    "category.create": `Created category${name}`,
    "category.update": `Updated category${name}`,
    "category.delete": `Deleted category${name}`,
    "collection.save": `Saved collection${name}`,
    "collection.delete": `Deleted collection${name}`,
    "promotion.create": `Created discount code${name}`,
    "promotion.update": `Updated discount code${name}`,
    "promotion.delete": `Deleted discount code${name}`,
    "content.draft": "Saved homepage draft",
    "content.publish": "Published the homepage",
    "content.discard": "Discarded homepage draft changes",
    "policy.save": `Saved the ${String(detail.approved ? "approved" : "draft")} policy text`,
    "announcement.save": `Saved announcement${name}`,
    "announcement.delete": `Deleted announcement${name}`,
    "team.add": `Added a team member${typeof detail.email === "string" ? ` ${detail.email}` : ""}`,
    "team.role": `Changed a role: ${String(detail.from)} → ${String(detail.to)}`,
    "team.revoke": `Revoked access${typeof detail.email === "string" ? ` for ${detail.email}` : ""}`,
    "team.restore": `Restored access${typeof detail.email === "string" ? ` for ${detail.email}` : ""}`,
    "email.test": "Sent a test email",
    "ai.use": "Used the writing assistant",
  };
  return map[a] ?? a;
}
