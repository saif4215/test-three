"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductCard } from "@/lib/catalog/types";
import { useBag, useFavourites } from "./providers";
import { EmptyState, Photo, Price } from "./ui";
import { Icon } from "./icons";

export function WishlistView() {
  const fav = useFavourites();
  const bag = useBag();
  const [fetched, setItems] = useState<ProductCard[] | null>(null);
  const key = fav.ids.join(",");
  const items = key ? fetched : [];

  useEffect(() => {
    if (!fav.ready || !key) return;
    const c = new AbortController();
    fetch(`/api/favourites?ids=${encodeURIComponent(key)}`, { signal: c.signal })
      .then((r) => r.json())
      .then((d: { items: ProductCard[] }) => setItems(d.items))
      .catch(() => {});
    return () => c.abort();
  }, [key, fav.ready]);

  if (!fav.ready || items === null) return <p role="status" className="py-10 text-center text-muted">Loading your favourites…</p>;
  const found = new Set(items.map((i) => i.id));
  const missing = fav.ids.filter((id) => !found.has(id));

  if (items.length === 0 && missing.length === 0) {
    return (
      <EmptyState title="No favourites yet" action={<Link href="/shop" className="btn-primary">Shop all</Link>}>
        Tap the heart on any product to save it here. Favourites are kept in this browser.
      </EmptyState>
    );
  }
  void bag;
  return (
    <div className="space-y-6">
      {missing.length > 0 ? (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">{missing.length} saved {missing.length === 1 ? "item is" : "items are"} no longer available.</p>
          <button type="button" className="mt-1 underline" onClick={() => missing.forEach((id) => fav.remove(id))}>
            Remove {missing.length === 1 ? "it" : "them"} from favourites
          </button>
        </div>
      ) : null}
      <ul className="grid grid-cols-2 gap-x-2 gap-y-10 sm:gap-x-3 lg:grid-cols-4" role="list">
        {items.map((p) => (
          <li key={p.id} className="group relative">
            <div className="relative aspect-square overflow-hidden bg-soft">
              <Photo image={p.image} sizes="(min-width:1024px) 22vw, 46vw" className={`size-full ${p.in_stock || !p.image ? "" : "opacity-50"}`} fallbackLabel={`${p.name}: photo coming soon`} />
              <button type="button" onClick={() => fav.remove(p.id)} aria-label={`Remove ${p.name} from favourites`} className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-white/90 shadow-sm hover:bg-white">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="px-1 pt-3">
              {!p.in_stock ? <p className="text-sm font-medium text-muted">Sold out</p> : null}
              <h3 className="font-medium">
                <Link href={`/products/${p.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">{p.name}</Link>
              </h3>
              {p.category_name ? <p className="text-muted">{p.category_name}</p> : null}
              <p className="mt-2"><Price cents={p.effective_price_cents} originalCents={p.original_price_cents} /></p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
