"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BagDrawer } from "./bag-drawer";

/**
 * The bag and favourites live in the visitor's own browser (localStorage). Nothing about them is trusted by the server:
 * checkout only ever reads the option ids and quantities, and prices come from the database.
 */
export interface BagItem {
  variantId: string;
  quantity: number;
}

const BAG_KEY = "icsi.bag.v1";
const FAV_KEY = "icsi.fav.v1";
const MAX_LINES = 50;
const MAX_QTY = 99;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface BagContext {
  items: BagItem[];
  count: number;
  ready: boolean;
  add: (variantId: string, quantity: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  bagOpen: boolean;
  openBag: () => void;
  closeBag: () => void;
}
interface FavContext {
  ids: string[];
  ready: boolean;
  has: (id: string) => boolean;
  toggle: (id: string) => boolean;
  remove: (id: string) => void;
}

const BagCtx = createContext<BagContext | null>(null);
const FavCtx = createContext<FavContext | null>(null);

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full: the bag then lasts for this page view only */
  }
}

function cleanBag(raw: unknown): BagItem[] {
  if (!Array.isArray(raw)) return [];
  const out: BagItem[] = [];
  for (const r of raw) {
    const id = (r as BagItem)?.variantId;
    const q = Math.floor(Number((r as BagItem)?.quantity));
    if (typeof id === "string" && UUID.test(id) && q >= 1 && !out.some((o) => o.variantId === id)) out.push({ variantId: id, quantity: Math.min(q, MAX_QTY) });
  }
  return out.slice(0, MAX_LINES);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<BagItem[]>([]);
  const [ready, setReady] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [bagOpen, setBagOpen] = useState(false);

  useEffect(() => {
    const load = () => {
      setItems(cleanBag(readJson<unknown>(BAG_KEY, [])));
      const fav = readJson<unknown>(FAV_KEY, []);
      setIds(Array.isArray(fav) ? fav.filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 200) : []);
      setReady(true);
    };
    load();
    // Keep several open tabs in step.
    const onStorage = (e: StorageEvent) => {
      if (e.key === BAG_KEY || e.key === FAV_KEY) load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const saveBag = useCallback((next: BagItem[]) => {
    setItems(next);
    writeJson(BAG_KEY, next);
  }, []);

  const bag = useMemo<BagContext>(
    () => ({
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      ready,
      add: (variantId, quantity) => {
        const cur = cleanBag(readJson<unknown>(BAG_KEY, []));
        const found = cur.find((i) => i.variantId === variantId);
        const next = found ? cur.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.min(i.quantity + quantity, MAX_QTY) } : i)) : [...cur, { variantId, quantity: Math.min(Math.max(1, quantity), MAX_QTY) }];
        saveBag(next.slice(0, MAX_LINES));
      },
      setQuantity: (variantId, quantity) => saveBag(quantity < 1 ? items.filter((i) => i.variantId !== variantId) : items.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.min(Math.floor(quantity), MAX_QTY) } : i))),
      remove: (variantId) => saveBag(items.filter((i) => i.variantId !== variantId)),
      clear: () => saveBag([]),
      bagOpen,
      openBag: () => setBagOpen(true),
      closeBag: () => setBagOpen(false),
    }),
    [items, ready, bagOpen, saveBag],
  );

  const fav = useMemo<FavContext>(
    () => ({
      ids,
      ready,
      has: (id) => ids.includes(id),
      toggle: (id) => {
        const on = !ids.includes(id);
        const next = on ? [id, ...ids].slice(0, 200) : ids.filter((x) => x !== id);
        setIds(next);
        writeJson(FAV_KEY, next);
        return on;
      },
      remove: (id) => {
        const next = ids.filter((x) => x !== id);
        setIds(next);
        writeJson(FAV_KEY, next);
      },
    }),
    [ids, ready],
  );

  return (
    <BagCtx.Provider value={bag}>
      <FavCtx.Provider value={fav}>
        {children}
        <BagDrawer />
      </FavCtx.Provider>
    </BagCtx.Provider>
  );
}

export function useBag(): BagContext {
  const c = useContext(BagCtx);
  if (!c) throw new Error("useBag must be used inside <Providers>");
  return c;
}
export function useFavourites(): FavContext {
  const c = useContext(FavCtx);
  if (!c) throw new Error("useFavourites must be used inside <Providers>");
  return c;
}
