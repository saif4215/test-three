import Link from "next/link";
import type { ProductCard as Card } from "@/lib/catalog/types";
import { Photo, Price } from "./ui";
import { WishlistButton } from "./wishlist-button";

/**
 * A product tile: a square photo on soft grey (a second photo fades in on hover), then name, category and price.
 * The whole tile is one link (the heading's link stretches over it); the favourite button sits above it.
 */
export function ProductCard({ product, wishlist, priority = false, className = "" }: { product: Card; wishlist: boolean; priority?: boolean; className?: string }) {
  const sale = product.original_price_cents !== null;
  const label = !product.in_stock ? { text: "Sold out", cls: "text-muted" } : product.is_new ? { text: "New", cls: "text-accent-ink" } : sale ? { text: "Sale", cls: "text-ok" } : null;
  return (
    <li className={`group relative ${className}`}>
      <div className="relative aspect-square overflow-hidden bg-soft">
        <Photo
          image={product.image}
          sizes="(min-width:1024px) 22vw, (min-width:640px) 30vw, 46vw"
          priority={priority}
          className={`size-full transition duration-500 ${product.image_hover ? "" : "group-hover:scale-[1.04]"} ${product.in_stock || !product.image ? "" : "opacity-50"}`}
          fallbackLabel={`${product.name}: photo coming soon`}
        />
        {product.image_hover ? (
          <Photo image={{ ...product.image_hover, alt: "" }} sizes="(min-width:1024px) 22vw, 46vw" className={`absolute inset-0 size-full opacity-0 transition duration-500 group-hover:opacity-100 ${product.in_stock ? "" : "!opacity-0"}`} />
        ) : null}
        {wishlist ? <WishlistButton productId={product.id} name={product.name} className="absolute right-3 top-3 z-10 opacity-100 sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100" /> : null}
      </div>
      <div className="px-1 pt-3 text-[0.9375rem] leading-snug sm:text-base">
        {label ? <p className={`text-sm font-medium ${label.cls}`}>{label.text}</p> : null}
        <h3 className="font-medium">
          <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:underline hover:underline-offset-4">
            {product.name}
          </Link>
        </h3>
        {product.category_name ? <p className="text-muted">{product.category_name}</p> : null}
        {product.color_count > 1 ? <p className="text-muted">{product.color_count} Colours</p> : null}
        <p className="mt-2">
          <Price cents={product.effective_price_cents} originalCents={product.original_price_cents} />
        </p>
      </div>
    </li>
  );
}

export function ProductGrid({ products, wishlist, columns = 3 }: { products: Card[]; wishlist: boolean; columns?: 3 | 4 }) {
  return (
    <ul className={`grid grid-cols-2 gap-x-2 gap-y-10 sm:gap-x-3 ${columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`} role="list">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} wishlist={wishlist} priority={i < 4} />
      ))}
    </ul>
  );
}
