import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFeatures, getStoreSettings } from "@/lib/settings";
import { trackOrder } from "@/lib/orders/tracking";
import { clientIp } from "@/lib/rate-limit";
import { STATUS_EXPLAINERS, STATUS_LABELS } from "@/lib/orders/status";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/util";
import { Alert, Photo } from "@/components/ui";
import { Icon } from "@/components/icons";
import { BagCleaner } from "@/components/bag-cleaner";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

const STEPS = ["Received", "Confirmed", "Ready", "Completed"];
const STEP_OF = { pending: 0, awaiting_payment: 0, confirmed: 1, ready: 2, completed: 3, cancelled: -1 } as const;

export default async function TrackedOrderPage({ params, searchParams }: { params: Promise<{ orderNumber: string }>; searchParams: Promise<{ code?: string; paid?: string; placed?: string }> }) {
  const [{ orderNumber }, sp, features, settings] = await Promise.all([params, searchParams, getFeatures(), getStoreSettings()]);
  if (!features.order_tracking) notFound();
  const res = await trackOrder(decodeURIComponent(orderNumber), sp.code ?? "", await clientIp());
  if (!res.ok) {
    if (res.reason === "limited") {
      return (
        <div className="container-page max-w-2xl py-14">
          <Alert tone="warn" title="Too many attempts">Please wait a few minutes and try again.</Alert>
        </div>
      );
    }
    notFound();
  }
  const o = res.view;
  const step = STEP_OF[o.status];
  const online = o.mode === "online";
  return (
    <div className="container-page max-w-3xl py-10 sm:py-14">
      {sp.placed === "1" || sp.paid === "1" ? <BagCleaner /> : null}
      <p className="text-sm text-muted">Order number</p>
      <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">{o.orderNumber}</h1>
      <p className="mt-2 text-muted">Placed {formatDateTime(o.placedAt, settings.timezone)}</p>

      {sp.paid === "1" && o.status === "awaiting_payment" ? (
        <div className="mt-6">
          <Alert tone="info" title="Thanks! We’re confirming your payment">
            This can take a moment. This page shows the latest status whenever you open it.
          </Alert>
        </div>
      ) : null}

      <section aria-labelledby="status" className="mt-8 rounded-2xl bg-soft p-6 sm:p-8">
        <h2 id="status" className="sr-only">
          Status
        </h2>
        <p className="display text-4xl sm:text-5xl">{o.status === "pending" && !online ? "Request received" : STATUS_LABELS[o.status]}</p>
        <p className="mt-3 max-w-xl text-lg text-muted">{STATUS_EXPLAINERS[o.status]}</p>
        {o.status !== "cancelled" ? (
          <ol className="mt-8 grid grid-cols-4 gap-2" aria-label="Progress">
            {STEPS.map((label, i) => (
              <li key={label} aria-current={i === step ? "step" : undefined} className="text-sm">
                <span className={`mb-2 block h-1.5 rounded-full ${i <= step ? "bg-ink" : "bg-line-strong"}`} />
                <span className={i <= step ? "font-medium" : "text-muted"}>{i === 0 && online ? "Payment" : label}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <section aria-labelledby="items" className="mt-10">
        <h2 id="items" className="mb-4 text-xl font-medium">
          Items
        </h2>
        <ul className="divide-y divide-line border-y border-line">
          {o.items.map((i) => (
            <li key={i.id} className="flex items-center gap-4 py-4">
              <span className="block size-20 shrink-0 overflow-hidden bg-soft">
                {i.image ? <Photo image={{ ...i.image, width: 400, height: 500, alt: "" }} sizes="80px" className="size-full" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {i.quantity} × {i.product_name}
                </span>
                {i.variant_label ? <span className="block text-sm text-muted">{i.variant_label}</span> : null}
              </span>
              <span className="font-medium">{formatMoney(i.unit_price_cents * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="ml-auto mt-4 max-w-xs space-y-2 text-base">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(o.subtotalCents)}</dd></div>
          {o.discountCents > 0 ? <div className="flex justify-between text-ok"><dt>Discount</dt><dd>−{formatMoney(o.discountCents)}</dd></div> : null}
          {o.feeCents > 0 ? <div className="flex justify-between"><dt>{o.fulfillmentLabel || "Fees"}</dt><dd>{formatMoney(o.feeCents)}</dd></div> : null}
          <div className="flex justify-between border-t border-line pt-2 text-lg font-medium"><dt>Total</dt><dd>{formatMoney(o.totalCents)}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="details" className="mt-10 grid gap-6 sm:grid-cols-2">
        <h2 id="details" className="sr-only">Order details</h2>
        {o.fulfillmentLabel ? (
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-muted"><Icon name="pin" size={18} />Receiving</p>
            <p className="mt-1">{o.fulfillmentLabel}</p>
          </div>
        ) : null}
        {o.students.length > 0 ? (
          <div>
            <p className="text-sm font-medium text-muted">Student{o.students.length === 1 ? "" : "s"}</p>
            <p className="mt-1">For: {o.students.map((s) => `${s.name} (${s.grade})`).join(", ")}</p>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="history" className="mt-10">
        <h2 id="history" className="mb-4 text-xl font-medium">History</h2>
        <ol className="space-y-3 border-l border-line-strong pl-5">
          {o.events.map((e, i) => (
            <li key={i} className="relative text-base">
              <span aria-hidden="true" className="absolute -left-[1.62rem] top-2 size-2.5 rounded-full bg-ink" />
              <span className="font-medium">{STATUS_LABELS[e.to_status]}</span>
              <span className="text-muted"> · {formatDateTime(e.created_at, settings.timezone)}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-10 text-sm text-muted">
        This page is private to you: anyone with its link can see this order’s status. Keep the link safe.{" "}
        <Link href="/shop" className="underline underline-offset-4">Keep shopping</Link>
      </p>
    </div>
  );
}
