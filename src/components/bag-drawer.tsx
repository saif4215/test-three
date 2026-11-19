"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useBag } from "./providers";
import { useQuote } from "./use-quote";
import { BagLine } from "./bag-lines";
import { Icon } from "./icons";
import { formatMoney } from "@/lib/util";

/**
 * The side bag that opens after "Add to Bag" and from the bag icon. It is a native <dialog>, so keyboard focus stays
 * inside, Escape closes it, and everything behind it is inert while it is open.
 */
export function BagDrawer() {
  const bag = useBag();
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const { quote, loading, error } = useQuote(bag.items, { enabled: bag.bagOpen });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (bag.bagOpen && !d.open) d.showModal();
    if (!bag.bagOpen && d.open) d.close();
  }, [bag.bagOpen]);

  // Going to another page closes the bag.
  useEffect(() => {
    bag.closeBag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const lines = quote?.lines ?? [];
  const canCheckout = !!quote && quote.ordering.open && quote.ok && quote.lines.length > 0;

  return (
    <dialog
      ref={ref}
      aria-label="Your bag"
      onClose={() => bag.closeBag()}
      onClick={(e) => {
        if (e.target === e.currentTarget) bag.closeBag();
      }}
      className="m-0 ml-auto h-dvh max-h-none w-[min(28rem,100vw)] max-w-none overflow-hidden border-0 bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/45 open:animate-[slide-in-right_0.28s_cubic-bezier(0.2,0.7,0.2,1)_both]"
    >
      {bag.bagOpen ? (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <h2 className="text-xl font-medium">
              Bag <span className="text-muted">({bag.count})</span>
            </h2>
            <button type="button" onClick={bag.closeBag} className="grid size-10 place-items-center rounded-full hover:bg-soft" aria-label="Close bag">
              <Icon name="close" size={22} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6">
            {bag.items.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-lg font-medium">Your bag is empty</p>
                <p className="mt-1 text-muted">Find something you like and add it here.</p>
                <Link href="/shop" onClick={bag.closeBag} className="btn-primary mt-6">
                  Shop all
                </Link>
              </div>
            ) : !quote ? (
              <p role="status" className="py-16 text-center text-muted">
                {error ?? "Checking prices…"}
              </p>
            ) : (
              <ul className="divide-y divide-line" aria-busy={loading}>
                {lines.map((l) => (
                  <BagLine key={l.variantId} line={l} onQuantity={(q) => bag.setQuantity(l.variantId, q)} onRemove={() => bag.remove(l.variantId)} onNavigate={bag.closeBag} />
                ))}
              </ul>
            )}
          </div>

          {bag.items.length > 0 && quote ? (
            <div className="space-y-3 border-t border-line px-6 py-5">
              <div className="flex items-baseline justify-between">
                <span className="text-muted">Subtotal</span>
                <span className="text-lg font-medium">{formatMoney(quote.subtotalCents)}</span>
              </div>
              {!quote.ordering.open ? (
                <p role="status" className="rounded-xl bg-soft px-4 py-3 text-sm">
                  <strong>{quote.ordering.title}.</strong> {quote.ordering.message} Your bag is saved in this browser.
                </p>
              ) : null}
              {canCheckout ? (
                <Link href="/checkout" className="btn-primary w-full !min-h-14" onClick={bag.closeBag}>
                  Checkout
                </Link>
              ) : null}
              <Link href="/cart" className="btn-secondary w-full" onClick={bag.closeBag}>
                View bag
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
