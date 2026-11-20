import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getOrder } from "@/lib/orders/queries";
import { allowedNext, STATUS_LABELS } from "@/lib/orders/status";
import { trackingUrl } from "@/lib/orders/tracking-code";
import { getFeatures, getStoreSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/format";
import { formatMoney, isUuid } from "@/lib/util";
import { AdminHeading, Breadcrumb, Section } from "@/components/admin-ui";
import { ActionForm, SubmitButton } from "@/components/admin-forms";
import { StatusBadge } from "@/components/status-badge";
import { addNoteAction, changeStatusAction, recordPaymentAction } from "../actions";

export const metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin("orders.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [found, settings, features] = await Promise.all([getOrder(id), getStoreSettings(), getFeatures()]);
  if (!found) notFound();
  const { order: o, items, events } = found;
  const next = allowedNext(o.status).filter((s) => !(o.status === "awaiting_payment" && s === "confirmed" && !["paid", "manual"].includes(o.payment_status)));
  const canManage = can(admin.role, "orders.manage");
  return (
    <>
      <Breadcrumb items={[{ href: "/admin/orders", label: "Orders" }, { label: o.order_number }]} />
      <AdminHeading title={o.order_number} actions={<StatusBadge status={o.status} />}>
        Placed {formatDateTime(o.created_at, settings.timezone)} · {o.mode === "request" ? "Order request (no online payment)" : "Online payment order"} · Payment: {o.payment_status === "none" ? "not taken online" : o.payment_status}
      </AdminHeading>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div>
          <Section title="Items">
            <ul className="divide-y divide-line">
              {items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-4 py-3">
                  <span>{i.quantity} × <span className="font-medium">{i.product_name}</span>{i.variant_label ? <span className="text-muted"> ({i.variant_label})</span> : null}{i.sku ? <span className="text-xs text-muted"> · {i.sku}</span> : null}</span>
                  <span className="font-medium">{formatMoney(i.unit_price_cents * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="ml-auto mt-4 max-w-xs space-y-2 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(o.subtotal_cents)}</dd></div>
              {o.discount_cents > 0 ? <div className="flex justify-between text-ok"><dt>Discount{o.promotion_code ? ` (${o.promotion_code})` : ""}</dt><dd>−{formatMoney(o.discount_cents)}</dd></div> : null}
              {o.fulfillment_fee_cents > 0 ? <div className="flex justify-between"><dt>{o.fulfillment_label || "Fees"}</dt><dd>{formatMoney(o.fulfillment_fee_cents)}</dd></div> : null}
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total</dt><dd>{formatMoney(o.total_cents)}</dd></div>
            </dl>
          </Section>
          <Section title="Customer">
            <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
              <dt className="text-muted">Name</dt><dd>{o.customer_name}</dd>
              <dt className="text-muted">Email</dt><dd><a href={`mailto:${o.customer_email}`} className="underline underline-offset-4">{o.customer_email}</a></dd>
              {o.customer_phone ? (<><dt className="text-muted">Phone</dt><dd>{o.customer_phone}</dd></>) : null}
              {o.fulfillment_label ? (<><dt className="text-muted">Receiving</dt><dd>{o.fulfillment_label}</dd></>) : null}
              {o.students.length ? (<><dt className="text-muted">For</dt><dd>{o.students.map((s) => `${s.name} (${s.grade})`).join(", ")}</dd></>) : null}
              {o.notes ? (<><dt className="text-muted">Customer notes</dt><dd className="whitespace-pre-line">{o.notes}</dd></>) : null}
              {features.order_tracking ? (<><dt className="text-muted">Tracking link</dt><dd className="break-all"><a href={trackingUrl(o.order_number, o.id)} className="underline underline-offset-4" target="_blank" rel="noreferrer">Open the customer’s page ↗</a></dd></>) : null}
            </dl>
          </Section>
        </div>

        <div>
          {canManage ? (
            <Section title="Update status">
              {next.length === 0 ? (
                <p className="text-sm text-muted">This order is {STATUS_LABELS[o.status].toLowerCase()}; there is nothing more to do.</p>
              ) : (
                <ActionForm action={changeStatusAction}>
                  <input type="hidden" name="id" value={o.id} />
                  <div><label htmlFor="to" className="label">New status</label><select id="to" name="to" className="field" defaultValue={next[0]}>{next.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></div>
                  <div><label htmlFor="note" className="label">Note to the customer (optional)</label><textarea id="note" name="note" maxLength={500} className="field !min-h-20" /><p className="hint">Included in the email we send when the status changes.</p></div>
                  <SubmitButton pendingLabel="Updating…">Update status</SubmitButton>
                </ActionForm>
              )}
              {o.status === "awaiting_payment" && !["paid", "manual"].includes(o.payment_status) ? <p className="mt-3 text-sm text-muted">Waiting for the card payment. It confirms automatically when it succeeds.</p> : null}
            </Section>
          ) : null}
          {can(admin.role, "orders.payment") && o.status !== "cancelled" && !["paid", "manual"].includes(o.payment_status) ? (
            <Section title="Record a payment">
              <ActionForm action={recordPaymentAction}>
                <input type="hidden" name="id" value={o.id} />
                <p className="text-sm text-muted">Use this when you received money in person (cash, cheque or a school account).</p>
                <div><label htmlFor="pay-note" className="label">Note (optional)</label><input id="pay-note" name="note" maxLength={200} className="field" placeholder="e.g. Cash at the front desk" /></div>
                <SubmitButton className="btn-secondary" pendingLabel="Recording…">Record payment received</SubmitButton>
              </ActionForm>
            </Section>
          ) : null}
          {canManage ? (
            <Section title="Staff notes (private)">
              <ActionForm action={addNoteAction}>
                <input type="hidden" name="id" value={o.id} />
                <label htmlFor="internal" className="sr-only">Staff notes</label>
                <textarea id="internal" name="note" defaultValue={o.internal_notes} maxLength={2000} className="field !min-h-24" placeholder="Only staff see this." />
                <SubmitButton className="btn-secondary" pendingLabel="Saving…">Save note</SubmitButton>
              </ActionForm>
            </Section>
          ) : null}
          <Section title="History">
            <ol className="space-y-3 border-l border-line-strong pl-5 text-sm">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span aria-hidden="true" className="absolute -left-[1.55rem] top-1.5 size-2.5 rounded-full bg-ink" />
                  <p className="font-medium">{STATUS_LABELS[e.to_status]}{e.from_status === e.to_status ? " (update)" : ""}</p>
                  {e.note ? <p>{e.note}</p> : null}
                  <p className="text-muted">{e.actor_label || "system"} · {formatDateTime(e.created_at, settings.timezone)}</p>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
      <p className="mt-2 text-sm"><Link href="/admin/orders" className="underline underline-offset-4">← All orders</Link></p>
    </>
  );
}
