"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

/**
 * The shop's layout: heading row (with Hide/Show Filters and Sort), active filters, then the filter column beside the
 * products. On phones the filters open in a full-height sheet. The filter choices themselves are plain links rendered on
 * the server, so they work without JavaScript; this component only shows and hides them.
 */
export function ShopFilters({
  heading,
  sort,
  chips,
  panel,
  activeCount,
  children,
}: {
  heading: React.ReactNode;
  sort: React.ReactNode;
  chips: React.ReactNode;
  panel: React.ReactNode;
  activeCount: number;
  children: React.ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const [sheet, setSheet] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (sheet && !d.open) d.showModal();
    if (!sheet && d.open) d.close();
  }, [sheet]);
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setSheet(false);
  }

  return (
    <div className="container-page py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">{heading}</div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setHidden((h) => !h)} aria-expanded={!hidden} aria-controls="shop-filters" className="hidden items-center gap-2 rounded-full px-4 py-2 text-base font-medium hover:bg-soft lg:inline-flex">
            {hidden ? "Show Filters" : "Hide Filters"}
            <Icon name="filter" size={20} />
          </button>
          <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" className="inline-flex items-center gap-2 rounded-full border border-line-strong px-4 py-2 text-base font-medium hover:border-ink lg:hidden">
            Filters{activeCount > 0 ? ` (${activeCount})` : ""}
            <Icon name="filter" size={18} />
          </button>
          {sort}
        </div>
      </div>
      {chips}
      <div className={`mt-6 ${hidden ? "" : "lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-10"}`}>
        <aside id="shop-filters" aria-label="Filters" className={hidden ? "hidden" : "hidden lg:block"}>
          <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-3 scrollbar-none">{panel}</div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>

      <dialog
        ref={dialog}
        aria-label="Filters"
        onClose={() => setSheet(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSheet(false);
        }}
        className="m-0 ml-auto h-dvh max-h-none w-[min(24rem,100vw)] max-w-none overflow-y-auto border-0 bg-white p-0 text-ink shadow-2xl backdrop:bg-black/45 open:animate-[slide-in-right_0.28s_cubic-bezier(0.2,0.7,0.2,1)_both]"
      >
        {sheet ? (
          <div className="px-6 pb-10 pt-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-medium">Filters</h2>
              <button type="button" onClick={() => setSheet(false)} className="grid size-11 place-items-center rounded-full hover:bg-soft" aria-label="Close filters">
                <Icon name="close" size={22} />
              </button>
            </div>
            {panel}
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
