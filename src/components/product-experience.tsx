"use client";

import { useMemo, useRef, useState } from "react";
import type { ProductDetail, ProductImagePublic } from "@/lib/catalog/types";
import { mediaSrcSet, mediaUrl } from "@/lib/media-url";
import { Icon } from "./icons";
import { Photo, Price } from "./ui";
import { useBag } from "./providers";
import { WishlistButton } from "./wishlist-button";
import { RestockForm } from "./restock-form";

/** Photos: a column of small pictures beside a large one (below it on a phone). Click the large one to zoom. */
function Gallery({ images, name }: { images: ProductImagePublic[]; name: string }) {
  const [i, setI] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const many = images.length > 1;
  const current = images[i] ?? null;
  const step = (d: number) => setI((n) => (n + d + images.length) % images.length);

  return (
    <div className="flex flex-col items-start gap-3 lg:flex-row-reverse lg:self-start">
      <div className="relative w-full min-w-0 flex-1 overflow-hidden bg-soft">
        {current ? (
          <button ref={opener} type="button" onClick={() => dialog.current?.showModal()} className="block w-full cursor-zoom-in" aria-label={`Zoom photo of ${name}`}>
            <Photo image={current} sizes="(min-width:1024px) 45vw, 100vw" priority className="aspect-[4/5] w-full" />
          </button>
        ) : (
          <Photo image={null} sizes="100vw" className="aspect-[4/5] w-full" fallbackLabel={`${name}: photo coming soon`} />
        )}
        {many ? (
          <>
            <button type="button" onClick={() => step(-1)} className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow hover:bg-white" aria-label="Previous photo">
              <Icon name="chevron-left" size={22} />
            </button>
            <button type="button" onClick={() => step(1)} className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow hover:bg-white" aria-label="Next photo">
              <Icon name="chevron-right" size={22} />
            </button>
          </>
        ) : null}
      </div>
      {many ? (
        <ul className="flex gap-2 overflow-x-auto lg:w-[4.5rem] lg:flex-col lg:overflow-visible" aria-label="Product photos">
          {images.map((img, idx) => (
            <li key={img.id} className="shrink-0">
              <button
                type="button"
                aria-pressed={idx === i}
                aria-label={`Show photo ${idx + 1} of ${images.length}`}
                onClick={() => setI(idx)}
                className={`block size-16 overflow-hidden bg-soft ring-offset-2 transition lg:size-[4.5rem] ${idx === i ? "ring-2 ring-ink" : "opacity-80 hover:opacity-100"}`}
              >
                <Photo image={img} sizes="72px" className="size-full" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <dialog
        ref={dialog}
        aria-label={`${name}: enlarged photo`}
        className="m-auto max-h-[96dvh] w-[min(96vw,64rem)] overflow-hidden border-0 bg-white p-0 shadow-2xl backdrop:bg-black/80"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
        onClose={() => opener.current?.focus()}
        onKeyDown={(e) => {
          if (!many) return;
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
      >
        {current ? (
          <div className="relative flex max-h-[96dvh] items-center justify-center bg-soft">
            <img src={mediaUrl(current, 1600)} srcSet={mediaSrcSet(current)} sizes="96vw" alt={current.alt} className="max-h-[92dvh] w-auto max-w-full object-contain" />
            <button type="button" onClick={() => dialog.current?.close()} className="absolute right-3 top-3 grid size-11 place-items-center rounded-full bg-white shadow" aria-label="Close enlarged photo">
              <Icon name="close" size={22} />
            </button>
            {many ? (
              <>
                <button type="button" onClick={() => step(-1)} className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white shadow" aria-label="Previous photo">
                  <Icon name="chevron-left" size={22} />
                </button>
                <button type="button" onClick={() => step(1)} className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white shadow" aria-label="Next photo">
                  <Icon name="chevron-right" size={22} />
                </button>
                <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs font-medium shadow" aria-live="polite">
                  Photo {i + 1} of {images.length}
                </p>
              </>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </div>
  );
}

export interface ExperienceProps {
  product: ProductDetail;
  categoryName: string | null;
  isNew: boolean;
  maxQuantity: number;
  canOrder: boolean;
  /** Why ordering isn't possible right now (shown instead of the button). */
  orderingNote: string | null;
  wishlist: boolean;
  restock: boolean;
  sizeGuideHtml: string;
  infoLines: string[];
  /** Server-rendered details (description, good to know) shown below the buy box. */
  children?: React.ReactNode;
}

export function ProductExperience({ product, categoryName, isNew, canOrder, orderingNote, wishlist, restock, sizeGuideHtml, infoLines, children }: ExperienceProps) {
  const bag = useBag();
  const { sizes, colors, variants } = product;
  const [size, setSize] = useState(sizes.length === 1 ? sizes[0] : "");
  const [color, setColor] = useState(colors.length === 1 ? colors[0] : "");
  const [needs, setNeeds] = useState<string | null>(null);
  const guide = useRef<HTMLDialogElement>(null);

  const needSize = sizes.length > 0 && !size;
  const needColor = colors.length > 0 && !color;
  const selected = useMemo(() => (needSize || needColor ? null : (variants.find((v) => (!sizes.length || v.size === size) && (!colors.length || v.color === color)) ?? null)), [variants, sizes.length, colors.length, size, color, needSize, needColor]);

  const optionAvailable = (s: string | null, c: string | null) => variants.some((v) => v.available && (s === null || v.size === s) && (c === null || v.color === c));

  const images = useMemo(() => {
    if (!color) return product.images;
    const own = product.images.filter((img) => img.color.toLowerCase() === color.toLowerCase());
    const shared = product.images.filter((img) => !img.color);
    return own.length ? [...own, ...shared] : product.images;
  }, [product.images, color]);

  const prices = variants.map((v) => v.unit_price_cents);
  const lowest = prices.length ? Math.min(...prices) : 0;
  const varies = prices.length > 0 && Math.max(...prices) !== lowest;
  const shown = selected ?? variants.find((v) => v.unit_price_cents === lowest) ?? null;

  function add() {
    if (needSize || needColor) {
      setNeeds(`Please select ${[needSize ? "a size" : "", needColor ? "a colour" : ""].filter(Boolean).join(" and ")}.`);
      return;
    }
    if (!selected || !selected.available) return;
    setNeeds(null);
    bag.add(selected.id, 1);
    bag.openBag();
  }

  const swatchImage = (c: string) => product.images.find((img) => img.color.toLowerCase() === c.toLowerCase()) ?? null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-14">
      <Gallery key={color} images={images} name={product.name} />

      <div className="lg:sticky lg:top-24 lg:self-start">
        {isNew ? <p className="mb-1 text-base font-medium text-accent-ink">New</p> : null}
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight sm:text-[2rem]">{product.name}</h1>
        {categoryName || product.short_description ? <p className="mt-1 text-base text-muted">{[categoryName, product.short_description].filter(Boolean).join(" · ")}</p> : null}
        <p className="mt-4 text-lg" aria-live="polite">
          {varies && !selected ? <span className="text-muted">From </span> : null}
          {shown ? <Price cents={shown.unit_price_cents} originalCents={shown.original_price_cents} /> : null}
        </p>
        {product.sku ? <p className="mt-1 text-xs text-muted">SKU: {product.sku}</p> : null}

        {colors.length > 1 ? (
          <fieldset className="mt-7">
            <legend className="mb-3 text-base font-medium">
              Colour<span className="font-normal text-muted">{color ? `: ${color}` : ""}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => {
                const img = swatchImage(c);
                const ok = optionAvailable(sizes.length && size ? size : null, c);
                return (
                  <label key={c} className={`relative block cursor-pointer overflow-hidden bg-soft has-[:checked]:ring-2 has-[:checked]:ring-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${img ? "size-16" : "min-h-12 px-4"} ${ok ? "" : "opacity-50"}`}>
                    <input
                      type="radio"
                      name="color"
                      value={c}
                      checked={color === c}
                      onChange={() => {
                        setColor(c);
                        setNeeds(null);
                      }}
                      className="sr-only"
                    />
                    {img ? <Photo image={{ ...img, alt: "" }} sizes="64px" className="size-full" /> : <span className="grid h-full place-items-center text-base">{c}</span>}
                    <span className="sr-only">
                      {c}
                      {ok ? "" : " (sold out)"}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {sizes.length > 0 ? (
          <fieldset className="mt-7">
            <legend className="mb-3 flex w-full items-baseline justify-between">
              <span className="text-base font-medium">Select Size</span>
              {sizeGuideHtml ? (
                <button type="button" onClick={() => guide.current?.showModal()} className="inline-flex items-center gap-1.5 text-base text-muted hover:text-ink">
                  <Icon name="ruler" size={18} />
                  Size Guide
                </button>
              ) : null}
            </legend>
            <div className={`grid gap-2 ${needs && needSize ? "rounded-md ring-1 ring-danger ring-offset-4" : ""} grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4`}>
              {sizes.map((s) => {
                const ok = optionAvailable(s, colors.length && color ? color : null);
                return (
                  <label key={s} className={`relative grid min-h-12 cursor-pointer place-items-center rounded-md border px-2 text-base transition has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${ok ? "border-line-strong hover:border-ink" : "border-line bg-soft text-muted line-through"}`}>
                    <input
                      type="radio"
                      name="size"
                      value={s}
                      checked={size === s}
                      onChange={() => {
                        setSize(s);
                        setNeeds(null);
                      }}
                      className="sr-only"
                    />
                    {s}
                    {ok ? null : <span className="sr-only"> (sold out)</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <div aria-live="polite" className="min-h-6 pt-2">
          {needs ? (
            <p className="text-sm font-medium text-danger" role="alert">
              {needs}
            </p>
          ) : null}
        </div>

        <div className="mt-3 space-y-3">
          {selected && !selected.available ? (
            <div className="space-y-3">
              <p role="status" className="rounded-xl bg-soft px-4 py-3 text-base font-medium">
                This option is out of stock.
              </p>
              {restock ? <RestockForm variantId={selected.id} /> : null}
            </div>
          ) : (
            <>
              {selected?.low_stock_count ? (
                <p role="status" className="text-sm font-medium text-warn">
                  Only {selected.low_stock_count} left in this option.
                </p>
              ) : null}
              {canOrder ? (
                <button type="button" onClick={add} className="btn-primary w-full !min-h-14 text-lg">
                  Add to Bag
                </button>
              ) : (
                <p className="rounded-xl bg-soft px-4 py-4 text-base">{orderingNote ?? "Ordering isn’t open yet. Please check back soon."}</p>
              )}
            </>
          )}
          {wishlist ? <WishlistButton productId={product.id} name={product.name} variant="pill" /> : null}
        </div>

        {infoLines.length > 0 ? (
          <ul className="mt-6 space-y-3 border-t border-line pt-6 text-base" aria-label="Ordering information">
            {infoLines.map((l) => (
              <li key={l} className="flex items-start gap-3">
                <Icon name="check" size={20} className="mt-0.5 shrink-0" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {children ? <div className="mt-8">{children}</div> : null}
      </div>

      {sizeGuideHtml ? (
        <dialog
          ref={guide}
          aria-label="Size guide"
          className="m-auto max-h-[90dvh] w-[min(92vw,40rem)] overflow-y-auto border-0 bg-white p-0 shadow-2xl backdrop:bg-black/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) guide.current?.close();
          }}
        >
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-medium">Size guide</h2>
              <button type="button" onClick={() => guide.current?.close()} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-soft" aria-label="Close size guide">
                <Icon name="close" size={22} />
              </button>
            </div>
            <div className="rich mt-4" dangerouslySetInnerHTML={{ __html: sizeGuideHtml }} />
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
