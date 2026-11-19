"use client";

import { useEffect } from "react";
import { useBag } from "./providers";

/** After an order is placed the bag is emptied, and the one-time flag is removed from the address. */
export function BagCleaner() {
  const bag = useBag();
  useEffect(() => {
    if (!bag.ready) return;
    bag.clear();
    const url = new URL(window.location.href);
    url.searchParams.delete("placed");
    window.history.replaceState(null, "", url.pathname + url.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bag.ready]);
  return null;
}
