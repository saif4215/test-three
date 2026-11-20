import { requireAdmin } from "@/lib/auth";
import { getFeatures, getStoreSettings } from "@/lib/settings";
import { bestSellers, ordersByStatus, salesByDay } from "@/lib/admin-stats";
import { STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";
import { formatMoney } from "@/lib/util";
import { AdminHeading, BarList, Section, StatCard, DownloadLink } from "@/components/admin-ui";
import { Alert } from "@/components/ui";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  await requireAdmin("analytics.view");
  const [features, settings] = await Promise.all([getFeatures(), getStoreSettings()]);
  if (!features.analytics) {
    return (
      <>
        <AdminHeading title="Analytics" />
        <Alert tone="warn" title="Analytics are switched off">Turn on “Analytics” in Settings to see sales and inventory reports.</Alert>
      </>
    );
  }
  const [days, sellers, statuses] = await Promise.all([salesByDay(30, settings.timezone), bestSellers(30, 8), ordersByStatus()]);
  const total = days.reduce((s, d) => s + d.revenueCents, 0);
  const orders = days.reduce((s, d) => s + d.orders, 0);
  const max = Math.max(1, ...days.map((d) => d.revenueCents));
  return (
    <>
      <AdminHeading title="Analytics" actions={<><DownloadLink href="/api/admin/export/sales">Sales CSV</DownloadLink><DownloadLink href="/api/admin/export/bestsellers">Best sellers CSV</DownloadLink><DownloadLink href="/api/admin/export/inventory">Inventory CSV</DownloadLink></>}>
        Only confirmed, ready and completed orders count as sales. A request nobody accepted is not a sale.
      </AdminHeading>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Sales, last 30 days" value={formatMoney(total)} />
        <StatCard label="Orders" value={orders} />
        <StatCard label="Average order" value={orders ? formatMoney(Math.round(total / orders)) : "—"} />
      </div>
      <Section title="Sales per day">
        <div role="img" aria-label={`Bar chart of daily sales for the last 30 days. Total ${formatMoney(total)}.`} className="flex h-44 items-end gap-1">
          {days.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${d.day}: ${formatMoney(d.revenueCents)} (${d.orders} orders)`}>
              <div className="w-full rounded-t bg-ink/85 transition group-hover:bg-ink" style={{ height: `${d.revenueCents ? Math.max(3, (d.revenueCents / max) * 100) : 0}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted"><span>{days[0]?.day}</span><span>{days.at(-1)?.day}</span></div>
        <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium">Show the numbers</summary>
          <table className="mt-2 w-full text-left"><caption className="sr-only">Sales per day</caption><thead><tr className="text-xs uppercase text-muted"><th scope="col" className="py-1">Day</th><th scope="col">Orders</th><th scope="col">Sales</th></tr></thead>
            <tbody>{days.filter((d) => d.orders > 0).map((d) => <tr key={d.day} className="border-t border-line"><td className="py-1">{d.day}</td><td>{d.orders}</td><td>{formatMoney(d.revenueCents)}</td></tr>)}</tbody></table>
        </details>
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Best sellers (30 days)">{sellers.length === 0 ? <p className="text-muted">No confirmed sales yet.</p> : <BarList rows={sellers.map((s) => ({ label: s.name, value: s.quantity }))} format={(n) => `${n} sold`} />}</Section>
        <Section title="Orders by status">{statuses.length === 0 ? <p className="text-muted">No orders yet.</p> : <BarList rows={statuses.map((s) => ({ label: STATUS_LABELS[s.status as OrderStatus] ?? s.status, value: s.n }))} />}</Section>
      </div>
    </>
  );
}
