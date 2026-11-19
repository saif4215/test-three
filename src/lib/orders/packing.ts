import "server-only";
import { query } from "../db";
import { buildPackingList, type PackingOrder } from "./packing-pure";

export const PACKING_SCOPES = {
  confirmed: { label: "Confirmed orders (to pack)", statuses: ["confirmed"] },
  ready: { label: "Ready orders (to hand out)", statuses: ["ready"] },
  active: { label: "Confirmed and ready", statuses: ["confirmed", "ready"] },
} as const;
export type PackingScope = keyof typeof PACKING_SCOPES;

export async function loadPackingList(scope: PackingScope, method?: string) {
  const statuses = PACKING_SCOPES[scope].statuses as readonly string[];
  const params: unknown[] = [statuses];
  let methodSql = "";
  if (method) {
    params.push(method);
    methodSql = "and o.fulfillment_label = $2";
  }
  const rows = (
    await query<{
      id: string; order_number: string; customer_name: string; students: PackingOrder["students"]; fulfillment_label: string; status: string;
      items: { name: string; variant: string; quantity: number }[];
    }>(
      `select o.id, o.order_number, o.customer_name, o.students, o.fulfillment_label, o.status,
              coalesce((select jsonb_agg(jsonb_build_object('name', i.product_name, 'variant', i.variant_label, 'quantity', i.quantity) order by i.product_name, i.variant_label)
                          from order_items i where i.order_id = o.id), '[]'::jsonb) as items
         from orders o where o.status = any($1::text[]) ${methodSql} order by o.created_at`,
      params,
    )
  ).rows;
  const methods = (await query<{ l: string }>("select distinct fulfillment_label as l from orders where fulfillment_label <> '' order by 1")).rows.map((r) => r.l);
  const orders: PackingOrder[] = rows.map((r) => ({ orderNumber: r.order_number, customerName: r.customer_name, students: r.students, fulfillmentLabel: r.fulfillment_label, status: r.status, items: r.items }));
  return { ...buildPackingList(orders), methods };
}
