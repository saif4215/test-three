import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getFeatures, loadStoreSettings, orderingStatus } from "@/lib/settings";
import { dashboardData, describeAction, recentActivity, recentOrders } from "@/lib/admin-stats";
import { loadPublishedContent, listPolicyPages } from "@/lib/content";
import { formatMoney } from "@/lib/util";
import { formatDateTime } from "@/lib/format";
import type { OrderStatus } from "@/lib/orders/status";
import { cancelAbandonedOnlineOrders } from "@/lib/orders/manage";
import { hasSampleProducts } from "@/lib/demo-data";
import { getSiteCheck, seenFromHeaders } from "@/lib/site-check";
import { AdminHeading, Section, StatCard } from "@/components/admin-ui";
import { StatusBadge } from "@/components/status-badge";
import { Icon } from "@/components/icons";
import { Alert } from "@/components/ui";
import { SampleProducts } from "@/components/sample-products";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const admin = await requireAdmin();
  await cancelAbandonedOnlineOrders().catch(() => 0);
  const settings = await loadStoreSettings();
  const [data, features, content, policies, orders, activity, hasSamples] = await Promise.all([
    dashboardData(settings.lowStockDefault),
    getFeatures(),
    loadPublishedContent(),
    listPolicyPages(),
    can(admin.role, "orders.view") ? recentOrders(6) : Promise.resolve([]),
    can(admin.role, "audit.view") ? recentActivity(6) : Promise.resolve([]),
    hasSampleProducts(),
  ]);
  const ordering = orderingStatus(features, settings);
  // Only the owner can fix server settings, so only the owner is told when something there needs a look.
  const h = await headers();
  const siteCheck = can(admin.role, "settings.manage") ? await getSiteCheck(seenFromHeaders((n) => h.get(n))).catch(() => null) : null;
  const checklist = [
    { done: data.products.published > 0, label: "Publish your first product", href: "/admin/products/new" },
    { done: !!(content.contact.email || content.contact.phone || content.contact.address), label: "Add approved contact information", href: "/admin/content" },
    { done: settings.fulfillmentMethods.some((m) => m.enabled), label: "Set up pickup / fulfilment instructions", href: "/admin/settings#pickup" },
    { done: policies.every((p) => p.approved), label: "Write and approve the terms, privacy and returns pages", href: "/admin/content/pages" },
    { done: ordering.modes.length > 0, label: "Turn on order requests or online payments", href: "/admin/settings#features" },
  ];
  const remaining = checklist.filter((c) => !c.done).length;

  return (
    <>
      <AdminHeading
        title={`Welcome, ${admin.name ? admin.name.split(" ")[0] : "there"}`}
        actions={
          <>
            {can(admin.role, "orders.view") && data.orders.pending > 0 ? <Link href="/admin/orders?status=pending" className="btn-primary btn-sm">Review {data.orders.pending} waiting</Link> : null}
            {can(admin.role, "products.manage") ? <Link href="/admin/products/new" className={data.orders.pending > 0 && can(admin.role, "orders.view") ? "btn-secondary btn-sm" : "btn-primary btn-sm"}>Add product</Link> : null}
            {can(admin.role, "orders.view") ? <Link href="/admin/orders" className="btn-secondary btn-sm">View orders</Link> : null}
            {can(admin.role, "content.manage") ? <Link href="/admin/content" className="btn-secondary btn-sm">Edit homepage</Link> : null}
          </>
        }
      >
        Here’s how the store looks right now.
      </AdminHeading>

      {siteCheck && siteCheck.worst !== "ok" ? (
        <div className="mb-6">
          <Alert tone={siteCheck.worst === "problem" ? "danger" : "warn"} title={`The site check found ${siteCheck.needAttention} ${siteCheck.needAttention === 1 ? "thing" : "things"} to look at`}>
            <Link href="/admin/site-check" className="underline underline-offset-4">Open Site check</Link> to see what it means and what to do.
          </Alert>
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Products" value={data.products.total} hint={`${data.products.published} published · ${data.products.drafts} drafts`} />
        <StatCard label="Needs a look" value={data.orders.pending} tone={data.orders.pending ? "warn" : undefined} hint={data.orders.pending ? "requests / payments waiting" : "nothing waiting"} />
        <StatCard label="Sales, last 30 days" value={formatMoney(data.orders.revenue30Cents)} hint={`${data.orders.confirmed30} confirmed orders`} />
        <StatCard label="Stock" value={data.stock.outOfStock + data.stock.lowStock} tone={data.stock.outOfStock ? "danger" : data.stock.lowStock ? "warn" : "ok"} hint={`${data.stock.outOfStock} out of stock · ${data.stock.lowStock} low`} />
      </div>

      {can(admin.role, "products.manage") && (hasSamples || data.products.total === 0) ? (
        <Section title={hasSamples ? "Sample products" : "Try it with sample products"}>
          <SampleProducts hasSamples={hasSamples} />
        </Section>
      ) : null}

      {remaining > 0 ? (
        <Section title="Getting the store ready">
          <ul className="space-y-2.5">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-3 text-base">
                <span aria-hidden="true" className={`grid size-6 place-items-center rounded-full ${c.done ? "bg-ink text-white" : "border border-line-strong"}`}>{c.done ? <Icon name="check" size={14} /> : null}</span>
                {c.done ? <span className="text-muted line-through">{c.label}</span> : <Link href={c.href} className="underline underline-offset-4">{c.label}</Link>}
                <span className="sr-only">{c.done ? " (done)" : " (to do)"}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {can(admin.role, "orders.view") ? (
          <Section title="Recent orders" actions={<Link href="/admin/orders" className="text-sm underline underline-offset-4">All orders</Link>}>
            {orders.length === 0 ? (
              <p className="text-muted">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
                    <div className="min-w-0">
                      <Link href={`/admin/orders/${o.id}`} className="font-medium underline underline-offset-4">{o.order_number}</Link>
                      <p className="truncate text-sm text-muted">{o.customer_name} · {formatDateTime(o.created_at, settings.timezone)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusBadge status={o.status as OrderStatus} />
                      <span className="w-16 text-right font-medium">{formatMoney(o.total_cents)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}
        {can(admin.role, "audit.view") ? (
          <Section title="Recent activity" actions={<Link href="/admin/audit" className="text-sm underline underline-offset-4">Full log</Link>}>
            <ul className="divide-y divide-line">
              {activity.map((a) => (
                <li key={a.id} className="py-3">
                  <p>{describeAction(a.action, a.detail)}</p>
                  <p className="text-sm text-muted">{a.actor_label} · {formatDateTime(a.created_at, settings.timezone)}</p>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </>
  );
}
