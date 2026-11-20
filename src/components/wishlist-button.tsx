"use client";

import { Icon } from "./icons";
import { useFavourites } from "./providers";

export function WishlistButton({ productId, name, className = "", variant = "icon" }: { productId: string; name: string; className?: string; variant?: "icon" | "pill" }) {
  const fav = useFavourites();
  const on = fav.ready && fav.has(productId);
  if (variant === "pill") {
    return (
      <button type="button" aria-pressed={on} onClick={() => fav.toggle(productId)} className={`btn-secondary w-full !min-h-14 ${className}`}>
        Favourite
        <Icon name="heart" size={20} className={on ? "fill-current" : ""} />
        <span className="sr-only">{on ? `: ${name} is in your favourites. Remove` : `: add ${name} to your favourites`}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      onClick={() => fav.toggle(productId)}
      className={`grid size-10 place-items-center rounded-full bg-white/90 text-ink shadow-sm backdrop-blur transition hover:bg-white ${className}`}
    >
      <Icon name="heart" size={20} className={on ? "fill-current" : ""} />
    </button>
  );
}
