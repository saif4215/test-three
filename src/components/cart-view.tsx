"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useBag } from "./providers";
import { useQuote } from "./use-quote";
import { BagLine } from "./bag-lines";
import { Alert, EmptyState } from "./ui";
import { formatMoney } from "@/lib/util";

export function CartView({ cartEnabled }: { cartEnabled: boolean }) {
  const bag = useBag();
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState("");
  const { quote, loading, error } = useQuote(bag.items, { promoCode: applied, enabled: cartEnabled && bag.ready });
  const [removedNote, setRemovedNote] = useState(false);

  // Options the server no longer recognises (unpublished, deleted) are dropped from the saved bag.
  useEffect(() => {
    if (!quote) return;
    const known = new Set(quote.lines.map((l) => l.variantId));
    const stale = bag.items.filter((i) => !known.has(i.variantId));
    if (stale.length) {
      stale.forEach((s) => bag.remove(s.variantId));
      setTimeout(() => setRemovedNote(true), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote]);

  if (!cartEnabled) {
    return (
      <EmptyState
        title="The bag isn’t available right now"
        action={
          <Link href="/shop" className="btn-primary">
            Browse merchandise
          </Link>
        }
      >
        You can still browse everything in the store.
      </EmptyState>
    );
  }
  if (!bag.ready)
    return (
      <p className="py-10 text-center text-muted" role="status">
        Loading your bag…
      </p>
    );
  if (bag.items.length === 0) {
    return (
      <>
        {removedNote ? (
          <div className="mb-4">
            <Alert tone="warn">Some items in your bag are no longer available and were removed.</Alert>
          </div>
        ) : null}
        <EmptyState
          title="Your bag is empty"
          action={
            <Link href="/shop" className="btn-primary">
              Shop all
            </Link>
          }
        >
          Find something you like and add it to your bag.
        </EmptyState>
      </>
    );
  }

  const canCheckout = !!quote && quote.ordering.open && quote.ok && quote.lines.length > 0;
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
      <div>
        {removedNote ? (
          <div className="mb-4">
            <Alert tone="warn">Some items in your bag are no longer available and were removed.</Alert>
          </div>
        ) : null}
        {error ? (
          <div className="mb-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}
        <ul className="divide-y divide-line border-y border-line" aria-busy={loading}>
          {(quote?.lines ?? []).map((l) => (
            <BagLine key={l.variantId} line={l} onQuantity={(q) => bag.setQuantity(l.variantId, q)} onRemove={() => bag.remove(l.variantId)} />
          ))}
          {!quote ? (
            <li className="p-8 text-center text-muted" role="status">
              Checking prices and availability…
            </li>
          ) : null}
        </ul>
      </div>

      <aside className="h-fit space-y-5 lg:sticky lg:top-24" aria-label="Order summary">
        <h2 className="text-2xl font-medium">Summary</h2>
        {quote?.promotionsEnabled ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setApplied(code.trim());
            }}
            className="space-y-1.5"
          >
            <label htmlFor="promo" className="label">
              Discount code
            </label>
            <div className="flex gap-2">
              <input id="promo" value={code} onChange={(e) => setCode(e.target.value)} className="field" autoComplete="off" maxLength={60} />
              <button type="submit" className="btn-secondary">
                Apply
              </button>
            </div>
            {quote.promoError ? (
              <p role="alert" className="text-sm font-medium text-danger">
                {quote.promoError}
              </p>
            ) : null}
            {quote.promoCode && !quote.promoError ? <p className="text-sm font-medium text-ok">Code {quote.promoCode} applied.</p> : null}
          </form>
        ) : null}
        <dl className="space-y-3 text-base">
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
              <dt>Fees</dt>
              <dd>{formatMoney(quote.feeCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-y border-line py-4 text-lg font-medium">
            <dt>Total</dt>
            <dd>{quote ? formatMoney(quote.totalCents) : "…"}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted">Prices and availability are confirmed again when you place your order.</p>
        {quote && quote.modes.length === 0 ? (
          <Alert tone="warn" title="Ordering isn’t open yet">
            Ordering hasn’t been switched on yet. Your bag is saved in this browser. Please check back soon.
          </Alert>
        ) : quote && !quote.ordering.open ? (
          <Alert tone="warn" title={quote.ordering.title ?? "Ordering isn’t available right now"}>
            {quote.ordering.message} Your bag is saved in this browser.
          </Alert>
        ) : (
          <Link href="/checkout" aria-disabled={!canCheckout} className={`btn-primary w-full !min-h-14 text-lg ${canCheckout ? "" : "pointer-events-none opacity-40"}`}>
            Checkout
          </Link>
        )}
      </aside>
    </div>
  );
}
