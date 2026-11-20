import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listOrders, orderStatusCounts } from "@/lib/orders/queries";
import { cancelAbandonedOnlineOrders } from "@/lib/orders/manage";
import { ORDER_STATUSES, STATUS_LABELS } from "@/lib/orders/status";
import { getStoreSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/util";
import { AdminHeading, DataTable, Td, Th, DownloadLink } from "@/components/admin-ui";
import { EmptyState, Pagination } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";

export const metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const admin = await requireAdmin("orders.view");
  const sp = await searchParams;
  await cancelAbandonedOnlineOrders().catch(() => 0);
  const [list, counts, settings] = await Promise.all([listOrders({ status: sp.status, q: sp.q, page: Number(sp.page) || 1 }), orderStatusCounts(), getStoreSettings()]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const tab = (value: string, label: string, n: number) => {
    const active = (sp.status ?? "all") === value;
    return (
      <Link key={value} href={`/admin/orders?${new URLSearchParams({ ...(value !== "all" ? { status: value } : {}), ...(sp.q ? { q: sp.q } : {}) })}`} aria-current={active ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-medium ${active ? "bg-ink text-white" : "bg-white hover:bg-line"}`}>
        {label} <span className={active ? "text-white/70" : "text-muted"}>{n}</span>
      </Link>
    );
  };
  return (
    <>
      <AdminHeading
        title="Orders"
        actions={
          <>
            <Link href="/admin/orders/packing-list" className="btn-secondary btn-sm">Packing list</Link>
            {can(admin.role, "orders.export") ? <DownloadLink href="/api/admin/export/orders">Export CSV</DownloadLink> : null}
          </>
        }
      >
        Order requests need your review. Confirmed orders count as sales.
      </AdminHeading>
      <nav aria-label="Order status" className="mb-4 flex flex-wrap gap-2">
        {tab("all", "All", total)}
        {ORDER_STATUSES.map((s) => tab(s, STATUS_LABELS[s], counts[s] ?? 0))}
      </nav>
      <form method="get" className="card mb-6 flex flex-wrap items-end gap-4 p-5">
        {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
        <div className="min-w-[16rem] flex-1"><label htmlFor="q" className="label">Search</label><input id="q" name="q" defaultValue={sp.q} className="field" placeholder="Order number, name, email, phone, student or class" /></div>
        <div className="flex gap-2"><button type="submit" className="btn-primary">Search</button><Link href="/admin/orders" className="btn-secondary">Reset</Link></div>
      </form>
      {list.items.length === 0 ? (
        <EmptyState title={sp.q || sp.status ? "No orders match" : "No orders yet"}>Orders and order requests appear here as customers place them.</EmptyState>
      ) : (
        <DataTable caption="Orders">
          <thead><tr><Th>Order</Th><Th>Placed</Th><Th>Customer</Th><Th>Items</Th><Th>Total</Th><Th>Status</Th></tr></thead>
          <tbody>
            {list.items.map((o) => (
              <tr key={o.id}>
                <Td><Link href={`/admin/orders/${o.id}`} className="font-medium underline underline-offset-4">{o.order_number}</Link><div className="text-xs text-muted">{o.mode === "request" ? "Request" : "Online"}{o.payment_status === "paid" || o.payment_status === "manual" ? " · paid" : ""}</div></Td>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(o.created_at, settings.timezone)}</Td>
                <Td>{o.customer_name}<div className="text-xs text-muted">{o.customer_email}</div>{o.students.length ? <div className="text-xs text-muted">For: {o.students.map((s) => `${s.name} (${s.grade})`).join(", ")}</div> : null}</Td>
                <Td>{o.item_count}</Td>
                <Td className="font-medium">{formatMoney(o.total_cents)}</Td>
                <Td><StatusBadge status={o.status} /></Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <Pagination page={list.page} pageCount={list.pageCount} basePath="/admin/orders" query={{ status: sp.status, q: sp.q }} />
    </>
  );
}
