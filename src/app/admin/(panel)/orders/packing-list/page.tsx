import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadPackingList, PACKING_SCOPES, type PackingScope } from "@/lib/orders/packing";
import { AdminHeading, Breadcrumb } from "@/components/admin-ui";
import { PrintButton } from "@/components/admin-forms";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Packing list" };

export default async function PackingListPage({ searchParams }: { searchParams: Promise<{ scope?: string; method?: string }> }) {
  await requireAdmin("orders.view");
  const sp = await searchParams;
  const scope = (sp.scope && sp.scope in PACKING_SCOPES ? sp.scope : "confirmed") as PackingScope;
  const data = await loadPackingList(scope, sp.method || undefined);
  return (
    <>
      <div className="no-print"><Breadcrumb items={[{ href: "/admin/orders", label: "Orders" }, { label: "Packing list" }]} /></div>
      <AdminHeading title="Packing list" actions={<><Link href="/admin/orders" className="btn-secondary no-print">Back to orders</Link><PrintButton label="Print this list" /></>}>
        {PACKING_SCOPES[scope].label} grouped by the student’s grade or class, so each class’s items can be handed out together.
      </AdminHeading>
      <form method="get" className="card no-print mb-6 flex flex-wrap items-end gap-4 p-5">
        <div><label htmlFor="scope" className="label">Which orders</label><select id="scope" name="scope" defaultValue={scope} className="field">{(Object.keys(PACKING_SCOPES) as PackingScope[]).map((k) => <option key={k} value={k}>{PACKING_SCOPES[k].label}</option>)}</select></div>
        {data.methods.length > 0 ? <div><label htmlFor="method" className="label">Pickup / delivery</label><select id="method" name="method" defaultValue={sp.method ?? ""} className="field"><option value="">All</option>{data.methods.map((m) => <option key={m} value={m}>{m}</option>)}</select></div> : null}
        <button type="submit" className="btn-primary">Show</button>
      </form>
      <h2 className="hidden text-xl font-semibold print:block">Packing list: {PACKING_SCOPES[scope].label}{sp.method ? ` · ${sp.method}` : ""}</h2>
      {data.orderCount === 0 ? (
        <EmptyState title="Nothing to pack">There are no orders in this group right now.</EmptyState>
      ) : (
        <>
          <section className="card mb-6 p-6" aria-labelledby="totals">
            <h2 id="totals" className="mb-3 text-lg font-semibold">Total to pick ({data.itemCount} item{data.itemCount === 1 ? "" : "s"} in {data.orderCount} order{data.orderCount === 1 ? "" : "s"})</h2>
            <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              {data.totals.map((t) => <li key={t.name + t.variant} className="flex justify-between gap-3 border-b border-line py-1"><span>{t.name}{t.variant ? ` (${t.variant})` : ""}</span><span className="font-semibold">{t.quantity}</span></li>)}
            </ul>
          </section>
          {data.groups.map((g) => (
            <section key={g.grade} aria-label={`${g.grade} (${g.orders.length} orders)`} className="card mb-6 break-inside-avoid p-6">
              <h3 className="mb-3 text-lg font-semibold">{g.grade} <span className="text-sm font-normal text-muted">· {g.orders.length} order{g.orders.length === 1 ? "" : "s"}</span></h3>
              <ul className="divide-y divide-line">
                {g.orders.map((o) => (
                  <li key={o.orderNumber} className="grid gap-1 py-3 text-sm sm:grid-cols-[14rem_1fr]">
                    <div><p className="font-medium">{o.students.length ? o.students.map((s) => s.name).join(", ") : o.customerName}</p><p className="text-muted">{o.orderNumber}{o.students.length ? ` · ${o.customerName}` : ""}</p>{o.fulfillmentLabel ? <p className="text-muted">{o.fulfillmentLabel}</p> : null}</div>
                    <ul>{o.items.map((i, n) => <li key={n}>{i.quantity} × {i.name}{i.variant ? ` (${i.variant})` : ""}</li>)}</ul>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}
