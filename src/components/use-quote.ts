"use client";

import { useEffect, useState } from "react";
import type { Quote } from "@/lib/orders/quote";
import type { BagItem } from "./providers";

/**
 * Asks the server for the real prices of what is in the bag. The browser never calculates money: it sends option ids and
 * quantities, and shows whatever the server answers.
 */
export function useQuote(items: BagItem[], opts: { promoCode?: string; fulfillmentId?: string; enabled?: boolean } = {}) {
  const { promoCode = "", fulfillmentId = "", enabled = true } = opts;
  const [answer, setAnswer] = useState<{ key: string; quote: Quote | null; error: string | null } | null>(null);
  const key = JSON.stringify([items, promoCode, fulfillmentId]);
  const active = enabled && items.length > 0;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/cart/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items, promoCode: promoCode || null, fulfillmentId: fulfillmentId || null }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(res.status === 429 ? "Too many requests. Please wait a moment." : "We couldn’t check prices right now.");
        setAnswer({ key, quote: (await res.json()) as Quote, error: null });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setAnswer((a) => ({ key, quote: a?.quote ?? null, error: (e as Error).message }));
      }
    }, 120);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
    // `items` is represented by `key`; depending on the array itself would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);

  // Nothing in the bag means nothing to price; otherwise "loading" lasts until the server has answered for THIS bag.
  const quote = active ? (answer?.quote ?? null) : null;
  const loading = active && answer?.key !== key;
  const error = active ? (answer?.error ?? null) : null;
  return { quote, loading, error };
}
