import { normalizeSort } from "./catalog/public";
import type { ProductFilters, SortKey } from "./catalog/types";

export type RawParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function dollarsToCents(v: string | undefined): number | undefined {
  if (!v || !/^\d{1,6}(\.\d{1,2})?$/.test(v)) return undefined;
  return Math.round(Number(v) * 100);
}

export interface ShopParams {
  /** What the database is asked for. */
  filters: ProductFilters;
  /** The same choices as they appear in the address bar (used to build links that toggle one choice). */
  query: Record<string, string | undefined>;
  sort: SortKey;
}

/** Turns the address-bar choices into a safe filter. Anything unrecognised is ignored. */
export function parseShopParams(raw: RawParams, fixed: { category?: string } = {}): ShopParams {
  const q = one(raw.q)?.slice(0, 100);
  const category = fixed.category ?? one(raw.category);
  const size = one(raw.size)?.slice(0, 30);
  const color = one(raw.color)?.slice(0, 40);
  const min = one(raw.min);
  const max = one(raw.max);
  const inStock = one(raw.instock) === "1";
  const onSale = one(raw.sale) === "1";
  const sort = normalizeSort(one(raw.sort) ?? (q ? "featured" : undefined));
  const page = Math.max(1, Number.parseInt(one(raw.page) ?? "1", 10) || 1);
  return {
    sort,
    filters: { q, category, size, color, minCents: dollarsToCents(min), maxCents: dollarsToCents(max), inStock, onSale, sort, page },
    query: { q, category: fixed.category ? undefined : category, size, color, min: dollarsToCents(min) !== undefined ? min : undefined, max: dollarsToCents(max) !== undefined ? max : undefined, instock: inStock ? "1" : undefined, sale: onSale ? "1" : undefined, sort: one(raw.sort) },
  };
}
