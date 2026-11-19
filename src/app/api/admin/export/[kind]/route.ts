import { NextResponse, type NextRequest } from "next/server";
import { adminFor } from "@/lib/auth";
import { query } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";
import { loadStoreSettings } from "@/lib/settings";
import { bestSellers, salesByDay } from "@/lib/admin-stats";
import { IMPORT_COLUMNS } from "@/lib/catalog/import";
import { SALE_STATUSES } from "@/lib/orders/status";
import type { Permission } from "@/lib/permissions";

const money = (c: number) => (c / 100).toFixed(2);

/** CSV downloads. Every one is permission-checked on the server, capped, formula-injection safe (see toCsv) and logged. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const perm: Permission | null = kind === "orders" ? "orders.export" : kind === "sales" || kind === "bestsellers" ? "analytics.view" : kind === "inventory" ? "products.view" : kind === "product-template" ? "products.manage" : null;
  if (!perm) return new NextResponse("Not found", { status: 404 });
  const g = await adminFor(perm);
  if ("error" in g) return new NextResponse(g.error === 401 ? "Please sign in." : "Not allowed.", { status: g.error });
  const settings = await loadStoreSettings();
  let header: string[] = [];
  let rows: unknown[][] = [];
  if (kind === "orders") {
    const r = await query<Record<string, unknown>>(
      `select o.order_number, o.created_at, o.status, o.mode, o.payment_status, o.customer_name, o.customer_email, o.customer_phone, o.fulfillment_label, o.subtotal_cents, o.discount_cents, o.fulfillment_fee_cents, o.total_cents,
              (select string_agg(s->>'name' || ' (' || (s->>'grade') || ')', '; ') from jsonb_array_elements(o.students) s) as students,
              (select string_agg(i.quantity || ' x ' || i.product_name || coalesce(' (' || nullif(i.variant_label, '') || ')', ''), '; ') from order_items i where i.order_id = o.id) as items
         from orders o order by o.created_at desc limit 20000`,
    );
    header = ["Order", "Placed", "Status", "Mode", "Payment", "Customer", "Email", "Phone", "Receiving", "Subtotal", "Discount", "Fees", "Total", "Students", "Items"];
    rows = r.rows.map((o) => [o.order_number, (o.created_at as Date).toISOString(), o.status, o.mode, o.payment_status, o.customer_name, o.customer_email, o.customer_phone, o.fulfillment_label, money(o.subtotal_cents as number), money(o.discount_cents as number), money(o.fulfillment_fee_cents as number), money(o.total_cents as number), o.students ?? "", o.items ?? ""]);
  } else if (kind === "sales") {
    header = ["Date", "Orders", "Sales"];
    rows = (await salesByDay(90, settings.timezone)).map((d) => [d.day, d.orders, money(d.revenueCents)]);
  } else if (kind === "bestsellers") {
    header = ["Product", "Units sold", "Sales"];
    rows = (await bestSellers(90, 200)).map((b) => [b.name, b.quantity, money(b.revenue)]);
    void SALE_STATUSES;
  } else if (kind === "inventory") {
    const r = await query<Record<string, unknown>>(
      `select p.name, p.status, v.size, v.color, v.sku, v.stock, v.active from product_variants v join products p on p.id = v.product_id order by p.name, v.sort limit 20000`,
    );
    header = ["Product", "Status", "Size", "Colour", "SKU", "Stock", "Active"];
    rows = r.rows.map((x) => [x.name, x.status, x.size, x.color, x.sku, x.stock, x.active ? "yes" : "no"]);
  } else {
    // Header row only: the products themselves are entered by the store owner, never pre-filled here.
    header = [...IMPORT_COLUMNS];
  }
  await audit({ id: g.admin.id, label: g.admin.email }, "export.download", "export", kind, { rows: rows.length }, await clientIp());
  return new NextResponse(toCsv(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="icsi-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
