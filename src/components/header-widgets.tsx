"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icons";
import { useBag, useFavourites } from "./providers";
import { formatMoney } from "@/lib/util";
import { mediaUrl } from "@/lib/media-url";

/** The bag icon. A plain click opens the side bag; with JavaScript off (or ctrl/cmd-click) it is an ordinary link to /cart. */
export function BagLink() {
  const { count, ready, openBag } = useBag();
  const label = `Bag${ready ? `, ${count} item${count === 1 ? "" : "s"}` : ""}`;
  return (
    <Link
      href="/cart"
      aria-label={label}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        openBag();
      }}
      className="relative grid size-11 place-items-center rounded-full transition hover:bg-soft"
    >
      <Icon name="bag" size={24} />
      {ready && count > 0 ? (
        <span key={count} aria-hidden="true" className="animate-pop absolute right-0.5 top-1 grid min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-semibold leading-5 text-brand-ink">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

export function FavLink() {
  const { ids, ready } = useFavourites();
  return (
    <Link href="/wishlist" aria-label={`Favourites${ready ? `, ${ids.length} saved` : ""}`} className="relative grid size-11 place-items-center rounded-full transition hover:bg-soft">
      <Icon name="heart" size={24} />
      {ready && ids.length > 0 ? <span aria-hidden="true" className="absolute right-2 top-2 size-2 rounded-full bg-brand" /> : null}
    </Link>
  );
}

interface Suggestion {
  slug: string;
  name: string;
  category: string | null;
  priceCents: number;
  image: { storage_key: string; widths: number[]; alt: string } | null;
}

/** Search with instant suggestions. Without JavaScript it is a normal form that opens the shop with the search applied. */
export function SearchBox({ id: idProp, className = "", autoFocus = false }: { id?: string; className?: string; autoFocus?: boolean }) {
  const auto = useId();
  const id = idProp ?? `search-${auto}`;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const c = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: c.signal });
        if (res.ok) setItems(((await res.json()) as { items: Suggestion[] }).items);
      } catch {
        /* a cancelled or failed lookup just shows no suggestions */
      }
    }, 180);
    return () => {
      window.clearTimeout(t);
      c.abort();
    };
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const show = open && q.trim().length >= 2 && items.length > 0; // `items` is ignored while the box holds fewer than 2 letters
  return (
    <form
      ref={box}
      action="/shop"
      method="get"
      role="search"
      className={`relative ${className}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        if (q.trim()) router.push(`/shop?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <label htmlFor={id} className="sr-only">
        Search merchandise
      </label>
      <Icon name="search" size={20} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink" />
      <input
        id={id}
        name="q"
        type="search"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="Search"
        maxLength={100}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={show}
        aria-controls={`${id}-results`}
        className="h-10 w-full rounded-full border border-transparent bg-soft pl-11 pr-4 text-base transition placeholder:text-muted hover:bg-line focus:border-ink focus:bg-white"
      />
      <div id={`${id}-results`} aria-live="polite" className={show ? "absolute left-0 top-full z-50 mt-2 w-[min(26rem,92vw)] overflow-hidden rounded-2xl border border-line bg-white shadow-xl" : "sr-only"}>
        {show ? (
          <>
            <ul>
              {items.map((s) => (
                <li key={s.slug}>
                  <Link href={`/products/${s.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-soft">
                    <span className="block size-12 shrink-0 overflow-hidden bg-soft">{s.image ? <img src={mediaUrl(s.image, 200)} alt="" className="size-full object-cover" /> : null}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="block truncate text-sm text-muted">{s.category ?? "Merchandise"}</span>
                    </span>
                    <span className="text-sm font-medium">{formatMoney(s.priceCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href={`/shop?q=${encodeURIComponent(q.trim())}`} onClick={() => setOpen(false)} className="block border-t border-line px-4 py-3 text-sm font-medium hover:bg-soft">
              See all results for “{q.trim()}”
            </Link>
          </>
        ) : null}
        {open && q.trim().length >= 2 && items.length > 0 ? <span className="sr-only">{items.length} suggestions</span> : null}
      </div>
    </form>
  );
}

export interface NavLink {
  href: string;
  label: string;
  tone?: "sale";
  /** Left out of the one-row header on laptop-sized screens (it is still in the phone menu and the footer). */
  optional?: boolean;
}

/** The phone menu: big bold links on a full-height panel. */
export function MobileNav({ links, secondary }: { links: NavLink[]; secondary: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // Close the menu after navigating (adjusting state while rendering, the pattern React recommends over an effect).
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-full hover:bg-soft xl:hidden" aria-label="Open menu" aria-haspopup="dialog">
        <Icon name="menu" size={24} />
      </button>
      <dialog
        ref={ref}
        aria-label="Menu"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className="m-0 h-dvh max-h-none w-[min(24rem,92vw)] max-w-none overflow-y-auto border-0 bg-white p-0 text-ink shadow-2xl backdrop:bg-black/45 open:animate-[slide-in-left_0.28s_cubic-bezier(0.2,0.7,0.2,1)_both]"
      >
        {open ? (
          <div className="flex min-h-full flex-col px-6 pb-10 pt-4">
            <div className="flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-full hover:bg-soft" aria-label="Close menu">
                <Icon name="close" size={24} />
              </button>
            </div>
            <div className="mb-6 mt-2">
              <SearchBox id="search-mobile" className="w-full" />
            </div>
            <nav aria-label="Menu">
              <ul className="space-y-1">
                {links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className={`flex items-center justify-between py-2.5 text-[1.75rem] font-medium leading-tight tracking-tight ${l.tone === "sale" ? "text-danger" : ""}`}>
                      {l.label}
                      <Icon name="chevron-right" size={22} className="text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <ul className="mt-10 space-y-3 border-t border-line pt-6 text-base text-muted">
              {secondary.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
