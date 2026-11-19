"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { useBag } from "./providers";
import { useQuote } from "./use-quote";
import { Alert, EmptyState, Photo } from "./ui";
import { submitOrder, type CheckoutState } from "@/app/actions/checkout";
import { formatMoney } from "@/lib/util";

export interface CheckoutConfig {
  modes: Array<"request" | "online">;
  /** Set when ordering is switched on but closed (outside the order window). */
  closed: { title: string; message: string } | null;
  studentInfo: "off" | "optional" | "required";
  fulfillment: { id: string; label: string; feeCents: number; instructionsHtml: string }[];
  requirePhone: boolean;
  requireTerms: boolean;
  policies: { terms: boolean; returns: boolean; privacy: boolean };
  instructionsHtml: string;
  prefill: { name: string; email: string } | null;
  signInHref: string | null;
}

function Step({ n, title, children, optional }: { n: number; title: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <section className="border-t border-line pt-8" aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="mb-5 flex items-center gap-3 text-xl font-medium">
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-ink text-sm font-semibold text-white">
          {n}
        </span>
        {title}
        {optional ? <span className="text-base font-normal text-muted">(optional)</span> : null}
      </h2>
      {children}
    </section>
  );
}

export function CheckoutForm({ config }: { config: CheckoutConfig }) {
  const bag = useBag();
  const [state, action, pending] = useActionState<CheckoutState, FormData>(submitOrder, {});
  const [mode, setMode] = useState<"request" | "online">(config.modes.includes("request") ? "request" : "online");
  const [fulfillmentId, setFulfillmentId] = useState(config.fulfillment.length === 1 ? config.fulfillment[0].id : "");
  const [students, setStudents] = useState([{ name: "", grade: "" }]);
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState("");
  const { quote, loading } = useQuote(bag.items, { promoCode: applied, fulfillmentId, enabled: bag.ready });

  if (config.closed) {
    return (
      <EmptyState
        title={config.closed.title}
        action={
          <Link href="/shop" className="btn-primary">
            Keep browsing
          </Link>
        }
      >
        {config.closed.message} Nothing has been submitted or charged.
      </EmptyState>
    );
  }
  if (!bag.ready)
    return (
      <p className="py-10 text-center text-muted" role="status">
        Loading…
      </p>
    );
  if (bag.items.length === 0) {
    return (
      <EmptyState
        title="Your bag is empty"
        action={
          <Link href="/shop" className="btn-primary">
            Shop all
          </Link>
        }
      />
    );
  }

  let step = 0;
  const needsFulfillment = config.fulfillment.length > 1 && !fulfillmentId;
  const chosen = config.fulfillment.find((f) => f.id === fulfillmentId) ?? (config.fulfillment.length === 1 ? config.fulfillment[0] : null);
  const policyLinks = [
    config.policies.terms ? (
      <Link key="t" href="/policies/terms" className="underline" target="_blank">
        terms
      </Link>
    ) : null,
    config.policies.returns ? (
      <Link key="r" href="/policies/returns" className="underline" target="_blank">
        returns policy
      </Link>
    ) : null,
    config.policies.privacy ? (
      <Link key="p" href="/policies/privacy" className="underline" target="_blank">
        privacy policy
      </Link>
    ) : null,
  ].filter(Boolean);

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-16">
      <form
        // Submitted by hand (not through the form's own `action`) so React doesn't clear what the customer typed if the server rejects the order.
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          f.set(
            "payload",
            JSON.stringify({
              mode,
              items: bag.items,
              promoCode: applied || null,
              fulfillmentId: fulfillmentId || null,
              name: f.get("name"),
              email: f.get("email"),
              phone: f.get("phone") || undefined,
              notes: f.get("notes") || undefined,
              acceptTerms: f.get("acceptTerms") === "on",
              students: config.studentInfo === "off" ? undefined : students.filter((s) => s.name.trim() || s.grade.trim()),
            }),
          );
          startTransition(() => action(f));
        }}
        className="space-y-8"
        aria-describedby={state.error ? "checkout-error" : undefined}
      >
        {state.error ? (
          <div id="checkout-error">
            <Alert tone="danger" title="We couldn’t place your order">
              {state.error}
            </Alert>
          </div>
        ) : null}
        <div className="hidden" aria-hidden="true">
          <label>
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        {config.modes.length > 1 ? (
          <Step n={++step} title="How would you like to order?">
            <div className="space-y-2" role="radiogroup" aria-label="How would you like to order?">
              {(
                [
                  ["online", "Pay online now", "Pay by card on a secure Stripe page. Your order is confirmed once the payment succeeds."],
                  ["request", "Send an order request", "No payment now. We review your request and confirm it."],
                ] as const
              ).map(([value, title, text]) => (
                <label key={value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-strong p-4 has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-ink">
                  <input type="radio" name="modeChoice" checked={mode === value} onChange={() => setMode(value)} className="mt-1 size-5 accent-[var(--brand)]" />
                  <span>
                    <span className="font-medium">{title}</span>
                    <span className="block text-sm text-muted">{text}</span>
                  </span>
                </label>
              ))}
            </div>
          </Step>
        ) : mode === "request" ? (
          <Alert tone="info" title="This is an order request">
            Your request is <strong>pending</strong> until we accept it. You won’t be charged online.
          </Alert>
        ) : null}

        <Step n={++step} title="Your details">
          {config.signInHref ? (
            <p className="mb-4 text-sm text-muted">
              Have an account?{" "}
              <Link href={config.signInHref} className="underline underline-offset-4">
                Sign in with Google
              </Link>{" "}
              to fill these in and see this order later. Or just continue as a guest.
            </p>
          ) : null}
          {config.prefill ? (
            <p className="mb-4 text-sm text-muted">
              Signed in as {config.prefill.email}. This order will appear in{" "}
              <Link href="/account" className="underline underline-offset-4">
                your account
              </Link>
              .
            </p>
          ) : null}
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="label">
                Parent / customer name
              </label>
              <input id="name" name="name" required minLength={2} maxLength={120} autoComplete="name" defaultValue={config.prefill?.name ?? ""} className="field" />
            </div>
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" defaultValue={config.prefill?.email ?? ""} className="field" />
              <p className="hint">We’ll send your order details and tracking link here.</p>
            </div>
            <div>
              <label htmlFor="phone" className="label">
                Phone{config.requirePhone ? "" : " (optional)"}
              </label>
              <input id="phone" name="phone" type="tel" required={config.requirePhone} maxLength={40} autoComplete="tel" className="field" />
            </div>
            <div>
              <label htmlFor="notes" className="label">
                Order notes (optional)
              </label>
              <textarea id="notes" name="notes" maxLength={1000} className="field" placeholder="Anything we should know about this order?" />
            </div>
          </div>
        </Step>

        {config.studentInfo !== "off" ? (
          <Step n={++step} title="Student information" optional={config.studentInfo === "optional"}>
            <fieldset>
              <legend className="mb-4 text-sm text-muted">Used only so we can find your order and hand it to the right student. Add each student the order is for.</legend>
              <div className="space-y-4">
                {students.map((st, i) => (
                  <div key={i} className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
                    <div>
                      <label htmlFor={`student-name-${i}`} className="label">
                        Student name{students.length > 1 ? ` ${i + 1}` : ""}
                      </label>
                      <input id={`student-name-${i}`} value={st.name} onChange={(e) => setStudents((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} required={config.studentInfo === "required"} maxLength={80} autoComplete="off" className="field" />
                    </div>
                    <div>
                      <label htmlFor={`student-grade-${i}`} className="label">
                        Grade or class
                      </label>
                      <input id={`student-grade-${i}`} value={st.grade} onChange={(e) => setStudents((all) => all.map((x, j) => (j === i ? { ...x, grade: e.target.value } : x)))} required={config.studentInfo === "required"} maxLength={40} autoComplete="off" className="field" />
                    </div>
                    {students.length > 1 ? (
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setStudents((all) => all.filter((_, j) => j !== i))}>
                        Remove<span className="sr-only"> student {i + 1}</span>
                      </button>
                    ) : null}
                  </div>
                ))}
                {students.length < 5 ? (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setStudents((all) => [...all, { name: "", grade: "" }])}>
                    Add another student
                  </button>
                ) : null}
              </div>
            </fieldset>
          </Step>
        ) : null}

        {config.fulfillment.length > 0 ? (
          <Step n={++step} title="Receiving your order">
            <fieldset className="space-y-2">
              <legend className="sr-only">Receiving your order</legend>
              {config.fulfillment.map((f) => (
                <label key={f.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-strong p-4 has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-ink">
                  <input type="radio" name="fulfillment" required value={f.id} checked={fulfillmentId === f.id || config.fulfillment.length === 1} onChange={() => setFulfillmentId(f.id)} className="mt-1 size-5 accent-[var(--brand)]" />
                  <span>
                    <span className="font-medium">{f.label}</span>
                    {f.feeCents > 0 ? <span className="text-sm text-muted"> · {formatMoney(f.feeCents)}</span> : null}
                    {f.instructionsHtml ? <span className="rich block !text-sm [&_p]:my-1" dangerouslySetInnerHTML={{ __html: f.instructionsHtml }} /> : null}
                  </span>
                </label>
              ))}
            </fieldset>
          </Step>
        ) : null}

        {config.instructionsHtml ? (
          <div className="rounded-2xl bg-soft p-6">
            <h2 className="text-lg font-medium">Before you order</h2>
            <div className="rich" dangerouslySetInnerHTML={{ __html: config.instructionsHtml }} />
          </div>
        ) : null}

        {config.requireTerms ? (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="acceptTerms" required className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" />
            <span>
              {policyLinks.length > 0 ? (
                <>
                  I have read and accept the{" "}
                  {policyLinks.map((l, i) => (
                    <span key={i}>
                      {i > 0 ? (i === policyLinks.length - 1 ? " and " : ", ") : ""}
                      {l}
                    </span>
                  ))}
                  .
                </>
              ) : (
                "I confirm the details above are correct and I agree to the terms of this order."
              )}
            </span>
          </label>
        ) : null}

        <div>
          <button type="submit" disabled={pending || !quote?.ok || needsFulfillment} className="btn-primary w-full !min-h-14 text-lg sm:w-auto sm:!px-14">
            {pending ? "Placing your order…" : mode === "online" ? "Continue to payment" : "Submit order request"}
          </button>
          {needsFulfillment ? <p className="mt-3 text-sm text-muted">Choose how you’d like to receive your order.</p> : null}
        </div>
      </form>

      <aside className="h-fit space-y-5 bg-soft p-6 lg:sticky lg:top-24" aria-label="Order summary" aria-busy={loading}>
        <h2 className="text-xl font-medium">Your order</h2>
        <ul className="space-y-4 text-sm">
          {(quote?.lines ?? []).map((l) => (
            <li key={l.variantId} className="flex items-center gap-3">
              <span aria-hidden="true" className="block size-16 shrink-0 overflow-hidden bg-white">
                <Photo image={l.image} sizes="64px" className="size-full" fallbackLabel="" />
              </span>
              <span className="min-w-0 flex-1">
                {l.quantity} × {l.name}
                {l.variantLabel ? <span className="block text-muted">{l.variantLabel}</span> : null}
              </span>
              <span className="font-medium">{formatMoney(l.lineTotalCents)}</span>
            </li>
          ))}
          {!quote ? <li className="text-muted">Checking prices…</li> : null}
        </ul>
        {quote?.issues.length ? (
          <Alert tone="danger" title="Please fix your bag">
            {quote.issues[0]}{" "}
            <Link className="underline" href="/cart">
              Go to bag
            </Link>
          </Alert>
        ) : null}
        {quote?.promotionsEnabled ? (
          <div className="space-y-1.5">
            <label htmlFor="promo2" className="label">
              Discount code
            </label>
            <div className="flex gap-2">
              <input id="promo2" value={code} onChange={(e) => setCode(e.target.value)} className="field" autoComplete="off" maxLength={60} />
              <button type="button" className="btn-secondary" onClick={() => setApplied(code.trim())}>
                Apply
              </button>
            </div>
            {quote.promoError ? (
              <p role="alert" className="text-sm font-medium text-danger">
                {quote.promoError}
              </p>
            ) : null}
            {quote.promoCode && !quote.promoError ? <p className="text-sm font-medium text-ok">Code {quote.promoCode} applied.</p> : null}
          </div>
        ) : null}
        <dl className="space-y-2.5 border-t border-line-strong pt-4 text-base">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{quote ? formatMoney(quote.subtotalCents) : "…"}</dd>
          </div>
          {quote && quote.discountCents > 0 ? (
            <div className="flex justify-between text-ok">
              <dt>Discount</dt>
              <dd>−{formatMoney(quote.discountCents)}</dd>
            </div>
          ) : null}
          {quote && quote.feeCents > 0 ? (
            <div className="flex justify-between">
              <dt>{chosen?.label ?? "Fees"}</dt>
              <dd>{formatMoney(quote.feeCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-lg font-medium">
            <dt>Total</dt>
            <dd>{quote ? formatMoney(quote.totalCents) : "…"}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
