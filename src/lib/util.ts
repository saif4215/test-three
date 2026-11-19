/** Small helpers that are safe to use in the browser as well as on the server. */

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export function formatMoney(cents: number): string {
  return usd.format(cents / 100);
}

/** "12", "12.5", "$12.50" -> 1250. Anything else (or a negative) -> null. */
export function parseMoneyToCents(input: string): number | null {
  const s = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Only http(s) links and same-site paths are ever rendered as links. Anything else (javascript:, data:) is dropped. */
export function safeUrl(u: string | null | undefined): string | null {
  const v = (u ?? "").trim();
  if (!v) return null;
  if (v.startsWith("/") && !v.startsWith("//") && !v.includes("\\")) return v;
  try {
    const url = new URL(v);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function uniqueBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = key(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s);

/** Standard clothing sizes sort in wearing order, everything else alphabetically (numbers numerically). */
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL"];
const YOUTH_ORDER = ["YXS", "YS", "YM", "YL", "YXL"];
export function sizeRank(size: string): [number, number | string] {
  const s = size.trim().toUpperCase();
  const y = YOUTH_ORDER.indexOf(s);
  if (y >= 0) return [0, y];
  const a = SIZE_ORDER.indexOf(s);
  if (a >= 0) return [1, a];
  if (/^\d+(\.\d+)?$/.test(s)) return [2, Number(s)];
  return [3, s];
}
export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const [ga, va] = sizeRank(a);
    const [gb, vb] = sizeRank(b);
    if (ga !== gb) return ga - gb;
    return typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
  });
}
