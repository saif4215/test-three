"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icons";

/**
 * A heading with a row of items that scrolls sideways (swipe on a phone, arrow buttons on a computer). The row is a
 * plain scrolling list, so keyboard users can tab through the links inside it.
 */
export function Carousel({ title, href, linkLabel = "View all", children }: { title: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  const id = useId();
  const scroller = useRef<HTMLUListElement>(null);
  const [state, setState] = useState({ prev: false, next: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setState({ prev: el.scrollLeft > 4, next: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const go = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section aria-labelledby={id}>
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 id={id} className="section-title">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {href ? (
            <Link href={href} className="mr-1 text-base font-medium underline-offset-4 hover:underline">
              {linkLabel}
            </Link>
          ) : null}
          <div className="hidden gap-2 md:flex">
            <button type="button" onClick={() => go(-1)} disabled={!state.prev} className="grid size-11 place-items-center rounded-full bg-soft transition hover:bg-line disabled:opacity-35" aria-label={`Previous ${title} items`}>
              <Icon name="chevron-left" size={22} />
            </button>
            <button type="button" onClick={() => go(1)} disabled={!state.next} className="grid size-11 place-items-center rounded-full bg-soft transition hover:bg-line disabled:opacity-35" aria-label={`Next ${title} items`}>
              <Icon name="chevron-right" size={22} />
            </button>
          </div>
        </div>
      </div>
      <ul
        ref={scroller}
        onScroll={measure}
        role="list"
        className="scrollbar-none -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto scroll-smooth px-4 sm:-mx-6 sm:scroll-px-6 sm:gap-3 sm:px-6 lg:-mx-12 lg:scroll-px-12 lg:px-12"
      >
        {children}
      </ul>
    </section>
  );
}
