import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFeatures, getStoreSettings } from "@/lib/settings";
import { getCustomer } from "@/lib/customers";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { trackingPath } from "@/lib/orders/tracking-code";
import type { OrderStatus } from "@/lib/orders/status";
import { Alert, EmptyState, PageHeading, Price } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { customerSignOutAction, deleteAccountAction } from "./actions";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default async function AccountPage() {
  const features = await getFeatures();
  if (!features.customer_sign_in) redirect("/account/login");
  const customer = await getCustomer();
  if (!customer) redirect("/account/login?next=/account");
  const settings = await getStoreSettings();
  // The email address was verified by Google, so orders placed as a guest with the same address belong to this person too.
  const orders = (
    await query<{ id: string; order_number: string; status: OrderStatus; total_cents: number; created_at: Date; items: number }>(
      `select o.id, o.order_number, o.status, o.total_cents, o.created_at,
              (select coalesce(sum(i.quantity), 0)::int from order_items i where i.order_id = o.id) as items
         from orders o where o.customer_id = $1 or lower(o.customer_email) = lower($2)
        order by o.created_at desc limit 50`,
      [customer.id, customer.email],
    )
  ).rows;
  return (
    <div className="container-page max-w-3xl py-10 sm:py-14">
      <PageHeading title="Your account">
        Signed in as {customer.name ? `${customer.name} · ` : ""}
        {customer.email}
      </PageHeading>
      <h2 className="mb-4 text-xl font-semibold">Your orders</h2>
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" action={<Link href="/shop" className="btn-primary">Start shopping</Link>}>
          Orders you place while signed in, or with this email address, will appear here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={trackingPath(o.order_number, o.id)} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-soft">
                <span>
                  <span className="block font-semibold">{o.order_number}</span>
                  <span className="text-sm text-muted">
                    {formatDate(o.created_at, settings.timezone)} · {o.items} item{o.items === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="flex items-center gap-4">
                  <StatusBadge status={o.status} />
                  <Price cents={o.total_cents} className="font-semibold" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-line pt-8">
        <form action={customerSignOutAction}>
          <button type="submit" className="btn-secondary">Sign out</button>
        </form>
      </div>

      <details className="mt-8 rounded-2xl border border-line p-5">
        <summary className="cursor-pointer font-medium">Delete my account</summary>
        <div className="mt-3 space-y-3 text-sm text-muted">
          <Alert tone="warn">This removes your sign-in record from the store. Orders you already placed stay with the store so they can still be handed out, but they will no longer be linked to an account.</Alert>
          <form action={deleteAccountAction}>
            <button type="submit" className="btn-secondary border-danger text-danger">Delete my account</button>
          </form>
        </div>
      </details>
    </div>
  );
}
