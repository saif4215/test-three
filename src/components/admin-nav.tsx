"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

export interface NavGroup {
  /** Empty for the main list that is always shown. */
  title: string;
  items: { href: string; label: string; badge?: number }[];
  /** A group shown as a closed "More" section; it opens by itself when you are on one of its pages. */
  collapsed?: boolean;
}

function useActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
}

function Groups({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const active = useActive();
  // The most specific match wins (so "Announcements" doesn't also light up "Homepage & content").
  const all = groups.flatMap((g) => g.items.map((i) => i.href));
  const best = (href: string) => active(href) && !all.some((o) => o !== href && o.startsWith(`${href}/`) && active(o));
  const list = (g: NavGroup) => (
    <ul className="space-y-0.5">
      {g.items.map((it) => (
        <li key={it.href}>
          <Link
            href={it.href}
            onClick={onNavigate}
            aria-current={best(it.href) ? "page" : undefined}
            className={`flex items-center justify-between rounded-full px-4 py-2 text-[0.9375rem] transition ${best(it.href) ? "bg-ink font-medium text-white" : "hover:bg-soft"}`}
          >
            {it.label}
            {it.badge ? <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${best(it.href) ? "bg-white text-ink" : "bg-ink text-white"}`}>{it.badge}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <nav aria-label="Admin" className="space-y-6">
      {groups.map((g) =>
        g.collapsed ? (
          <details key={g.title} open={g.items.some((it) => best(it.href))} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-full px-4 py-2 text-[0.9375rem] font-medium text-muted transition hover:bg-soft hover:text-ink">
              {g.title}
              <Icon name="chevron-down" size={18} className="transition group-open:rotate-180" />
            </summary>
            <div className="mt-1">{list(g)}</div>
          </details>
        ) : (
          <div key={g.title || "main"}>
            {g.title ? <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.title}</p> : null}
            {list(g)}
          </div>
        ),
      )}
    </nav>
  );
}

export function AdminSidebar({ groups }: { groups: NavGroup[] }) {
  return (
    <aside className="no-print sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r border-line bg-white px-3 py-6 lg:block">
      <Groups groups={groups} />
    </aside>
  );
}

export function AdminMobileNav({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-full hover:bg-soft lg:hidden" aria-label="Open admin menu" aria-haspopup="dialog">
        <Icon name="menu" size={22} />
      </button>
      <dialog
        ref={ref}
        aria-label="Admin menu"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className="m-0 h-dvh max-h-none w-[min(20rem,90vw)] max-w-none overflow-y-auto border-0 bg-white p-0 shadow-2xl backdrop:bg-black/45"
      >
        {open ? (
          <div className="px-3 pb-8 pt-3">
            <div className="mb-3 flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-full hover:bg-soft" aria-label="Close menu">
                <Icon name="close" size={22} />
              </button>
            </div>
            <Groups groups={groups} onNavigate={() => setOpen(false)} />
          </div>
        ) : null}
      </dialog>
    </>
  );
}
