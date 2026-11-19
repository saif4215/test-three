import "server-only";
import { cache } from "react";
import { query } from "../db";
import { sortSizes } from "../util";
import type { Facets, ProductCard, ProductDetail, ProductFilters, ProductList, PublicCategory, SortKey, VariantPublic } from "./types";
export type { ProductCard, ProductDetail, ProductFilters, PublicCategory } from "./types";

/* ------------------------------------------------------------------ product cards */

/** The shared SELECT for cards. `$LOW` placeholders are not used: low-stock wording only appears on the product page. */
const CARD_SELECT = `
  select p.id, p.slug, p.name, p.short_description, p.featured, p.created_at, p.published_at,
    coalesce(vp.min_price, coalesce(p.sale_price_cents, p.price_cents)) as effective_price_cents,
    case when p.sale_price_cents is not null and coalesce(vp.sale_applies, true) then p.price_cents end as original_price_cents,
    coalesce(vp.in_stock, false) as in_stock,
    coalesce(vp.color_count, 0)::int as color_count,
    (select c.name from product_categories pc join categories c on c.id = pc.category_id where pc.product_id = p.id order by c.sort, c.name limit 1) as category_name,
    (p.published_at is not null and p.published_at > now() - interval '30 days') as is_new,
    img.id as img_id, img.storage_key as img_key, img.widths as img_widths, img.width as img_w, img.height as img_h, img.alt as img_alt,
    img2.id as img2_id, img2.storage_key as img2_key, img2.widths as img2_widths, img2.width as img2_w, img2.height as img2_h, img2.alt as img2_alt
  from products p
  left join lateral (
    select min(coalesce(v.price_cents, coalesce(p.sale_price_cents, p.price_cents))) as min_price,
           bool_or(v.price_cents is null) as sale_applies,
           bool_or(not p.track_inventory or v.stock > 0) as in_stock,
           count(distinct nullif(v.color, '')) as color_count
      from product_variants v where v.product_id = p.id and v.active
  ) vp on true
  left join lateral (
    select a.id, a.storage_key, a.widths, a.width, a.height, coalesce(nullif(i.alt, ''), p.name) as alt
      from product_images i join media_assets a on a.id = i.asset_id
     where i.product_id = p.id order by i.is_primary desc, i.sort, i.id limit 1
  ) img on true
  left join lateral (
    select a.id, a.storage_key, a.widths, a.width, a.height, coalesce(nullif(i.alt, ''), p.name) as alt
      from product_images i join media_assets a on a.id = i.asset_id
     where i.product_id = p.id order by i.is_primary desc, i.sort, i.id offset 1 limit 1
  ) img2 on true`;

interface CardRow {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  featured: boolean;
  category_name: string | null;
  effective_price_cents: number;
  original_price_cents: number | null;
  in_stock: boolean;
  color_count: number;
  is_new: boolean;
  img_id: string | null;
  img_key: string | null;
  img_widths: number[] | null;
  img_w: number | null;
  img_h: number | null;
  img_alt: string | null;
  img2_id: string | null;
  img2_key: string | null;
  img2_widths: number[] | null;
  img2_w: number | null;
  img2_h: number | null;
  img2_alt: string | null;
}

function toCard(r: CardRow): ProductCard {
  const image = r.img_id ? { id: r.img_id, storage_key: r.img_key!, widths: r.img_widths!, width: r.img_w!, height: r.img_h!, alt: r.img_alt! } : null;
  const hover = r.img2_id ? { id: r.img2_id, storage_key: r.img2_key!, widths: r.img2_widths!, width: r.img2_w!, height: r.img2_h!, alt: r.img2_alt! } : null;
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    short_description: r.short_description,
    category_name: r.category_name,
    effective_price_cents: r.effective_price_cents,
    original_price_cents: r.original_price_cents,
    in_stock: r.in_stock,
    color_count: r.color_count,
    image,
    image_hover: hover,
    featured: r.featured,
    is_new: r.is_new,
  };
}

const ORDER: Record<SortKey, string> = {
  featured: "p.featured desc, p.published_at desc nulls last, p.created_at desc",
  newest: "p.published_at desc nulls last, p.created_at desc",
  price_asc: "effective_price_cents asc, p.name",
  price_desc: "effective_price_cents desc, p.name",
  name: "lower(p.name)",
};

export function normalizeSort(v: string | undefined): SortKey {
  return v && v in ORDER ? (v as SortKey) : "featured";
}

export async function listProducts(f: ProductFilters = {}): Promise<ProductList> {
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where: string[] = ["p.status = 'published'"];
  if (f.q?.trim()) {
    const like = p(`%${f.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    where.push(`(p.name ilike ${like} or p.short_description ilike ${like} or p.sku ilike ${like}
      or exists (select 1 from unnest(p.tags) t where t ilike ${like})
      or exists (select 1 from product_variants v where v.product_id = p.id and v.sku ilike ${like})
      or exists (select 1 from product_categories pc join categories c on c.id = pc.category_id where pc.product_id = p.id and c.name ilike ${like}))`);
  }
  if (f.category) where.push(`exists (select 1 from product_categories pc join categories c on c.id = pc.category_id where pc.product_id = p.id and c.slug = ${p(f.category)})`);
  if (f.size) where.push(`exists (select 1 from product_variants v where v.product_id = p.id and v.active and lower(v.size) = lower(${p(f.size)}))`);
  if (f.color) where.push(`exists (select 1 from product_variants v where v.product_id = p.id and v.active and lower(v.color) = lower(${p(f.color)}))`);
  if (f.onSale) where.push(`p.sale_price_cents is not null`);
  if (f.inStock) where.push(`exists (select 1 from product_variants v where v.product_id = p.id and v.active and (not p.track_inventory or v.stock > 0))`);

  const inner = `${CARD_SELECT} where ${where.join(" and ")}`;
  // Price filters apply to the computed lowest price, so they wrap the card query.
  const outerWhere: string[] = [];
  if (f.minCents !== undefined) outerWhere.push(`effective_price_cents >= ${p(f.minCents)}`);
  if (f.maxCents !== undefined) outerWhere.push(`effective_price_cents <= ${p(f.maxCents)}`);
  const sort = normalizeSort(f.sort);
  const pageSize = Math.min(Math.max(f.pageSize ?? 24, 1), 60);
  const wanted = Math.max(f.page ?? 1, 1);

  const base = `select * from (${inner}) p ${outerWhere.length ? `where ${outerWhere.join(" and ")}` : ""}`;
  const total = Number((await query<{ n: string }>(`select count(*) as n from (${base}) x`, params)).rows[0].n);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(wanted, pageCount);
  const rows = (await query<CardRow>(`${base} order by ${ORDER[sort]} limit ${pageSize} offset ${(page - 1) * pageSize}`, params)).rows;
  return { items: rows.map(toCard), total, page, pageCount };
}

export async function getProductCardsByIds(ids: string[]): Promise<ProductCard[]> {
  if (ids.length === 0) return [];
  const rows = (await query<CardRow>(`${CARD_SELECT} where p.status = 'published' and p.id = any($1::uuid[])`, [ids])).rows;
  const by = new Map(rows.map((r) => [r.id, toCard(r)]));
  return ids.map((id) => by.get(id)).filter((c): c is ProductCard => !!c);
}

export async function featuredProducts(limit = 8): Promise<ProductCard[]> {
  return (await listProducts({ sort: "featured", pageSize: limit })).items.filter((c) => c.featured);
}

export async function newArrivals(limit = 8): Promise<ProductCard[]> {
  return (await listProducts({ sort: "newest", pageSize: limit })).items;
}

/* ------------------------------------------------------------------ facets (filter choices) */

export const getFacets = cache(async (): Promise<Facets> => {
  const v = await query<{ size: string; color: string }>(
    `select distinct v.size, v.color from product_variants v join products p on p.id = v.product_id where p.status = 'published' and v.active`,
  );
  const prices = await query<{ lo: number | null; hi: number | null }>(
    `select min(coalesce(v.price_cents, coalesce(p.sale_price_cents, p.price_cents))) as lo, max(coalesce(v.price_cents, coalesce(p.sale_price_cents, p.price_cents))) as hi
       from product_variants v join products p on p.id = v.product_id where p.status = 'published' and v.active`,
  );
  const sizes = sortSizes([...new Set(v.rows.map((r) => r.size).filter(Boolean))]);
  const colors = [...new Set(v.rows.map((r) => r.color).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return { sizes, colors, minCents: prices.rows[0].lo ?? 0, maxCents: prices.rows[0].hi ?? 0 };
});

/* ------------------------------------------------------------------ categories & collections */

export const listPublicCategories = cache(async (): Promise<PublicCategory[]> => {
  const rows = (
    await query<{
      id: string; name: string; slug: string; description: string; show_on_home: boolean; product_count: number;
      img_id: string | null; img_key: string | null; img_widths: number[] | null; img_w: number | null; img_h: number | null; img_alt: string | null;
    }>(
      `select c.id, c.name, c.slug, c.description, c.show_on_home,
              (select count(*) from product_categories pc join products p on p.id = pc.product_id where pc.category_id = c.id and p.status = 'published')::int as product_count,
              coalesce(own.id, first.id) as img_id, coalesce(own.storage_key, first.storage_key) as img_key, coalesce(own.widths, first.widths) as img_widths,
              coalesce(own.width, first.width) as img_w, coalesce(own.height, first.height) as img_h, coalesce(own.alt, first.alt) as img_alt
         from categories c
         left join media_assets own on own.id = c.image_asset_id
         left join lateral (
           select a.id, a.storage_key, a.widths, a.width, a.height, coalesce(nullif(i.alt, ''), p.name) as alt
             from product_categories pc join products p on p.id = pc.product_id and p.status = 'published'
             join product_images i on i.product_id = p.id join media_assets a on a.id = i.asset_id
            where pc.category_id = c.id order by i.is_primary desc, p.featured desc, p.published_at desc nulls last limit 1
         ) first on true
        order by c.sort, c.name`,
    )
  ).rows;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    show_on_home: r.show_on_home,
    product_count: r.product_count,
    image: r.img_id ? { id: r.img_id, storage_key: r.img_key!, widths: r.img_widths!, width: r.img_w!, height: r.img_h!, alt: r.img_alt ?? r.name } : null,
  }));
});

export async function getCategoryBySlug(slug: string): Promise<PublicCategory | null> {
  return (await listPublicCategories()).find((c) => c.slug === slug) ?? null;
}

export interface PublicCollection {
  id: string;
  title: string;
  slug: string;
  description: string;
  featured: boolean;
}

const COLLECTION_LIVE = `c.status = 'published' and (c.starts_at is null or c.starts_at <= now()) and (c.ends_at is null or c.ends_at > now())`;

export async function listPublicCollections(opts: { featuredOnly?: boolean } = {}): Promise<PublicCollection[]> {
  return (
    await query<PublicCollection>(
      `select c.id, c.title, c.slug, c.description, c.featured from collections c
        where ${COLLECTION_LIVE} ${opts.featuredOnly ? "and c.featured" : ""}
          and exists (select 1 from collection_products cp join products p on p.id = cp.product_id where cp.collection_id = c.id and p.status = 'published')
        order by c.sort, c.created_at desc`,
    )
  ).rows;
}

export async function getCollectionBySlug(slug: string): Promise<PublicCollection | null> {
  const r = await query<PublicCollection>(`select c.id, c.title, c.slug, c.description, c.featured from collections c where c.slug = $1 and ${COLLECTION_LIVE}`, [slug]);
  return r.rows[0] ?? null;
}

export async function collectionProducts(collectionId: string): Promise<ProductCard[]> {
  const rows = (
    await query<CardRow>(
      `${CARD_SELECT} join collection_products cp on cp.product_id = p.id and cp.collection_id = $1 where p.status = 'published' order by cp.sort, p.name`,
      [collectionId],
    )
  ).rows;
  return rows.map(toCard);
}

export const hasSaleProducts = cache(async (): Promise<boolean> => {
  const r = await query(`select 1 from products p where p.status = 'published' and p.sale_price_cents is not null
    and exists (select 1 from product_variants v where v.product_id = p.id and v.active and (not p.track_inventory or v.stock > 0)) limit 1`);
  return (r.rowCount ?? 0) > 0;
});

export const hasUniformProducts = cache(async (): Promise<boolean> => {
  const r = await query(
    `select 1 from products p join product_categories pc on pc.product_id = p.id join categories c on c.id = pc.category_id
      where p.status = 'published' and c.slug = 'uniforms' limit 1`,
  );
  return (r.rowCount ?? 0) > 0;
});

/* ------------------------------------------------------------------ one product */

interface ProductRow {
  id: string; slug: string; name: string; short_description: string; description_md: string; instructions_md: string; size_chart_md: string;
  status: "draft" | "published" | "archived"; sku: string; tags: string[]; featured: boolean; price_cents: number; sale_price_cents: number | null;
  track_inventory: boolean; low_stock_threshold: number | null; is_new: boolean;
}

/**
 * One product with its photos and options. Drafts and archived products are only returned when `allowUnpublished` is
 * true, which callers set only after checking that a signed-in staff member asked for a preview.
 */
export async function getProductBySlug(slug: string, opts: { allowUnpublished?: boolean; lowStockDefault?: number } = {}): Promise<ProductDetail | null> {
  const pr = await query<ProductRow>(
    `select id, slug, name, short_description, description_md, instructions_md, size_chart_md, status, sku, tags, featured, price_cents, sale_price_cents, track_inventory, low_stock_threshold,
            (published_at is not null and published_at > now() - interval '30 days') as is_new
       from products where slug = $1 ${opts.allowUnpublished ? "" : "and status = 'published'"}`,
    [slug],
  );
  const p = pr.rows[0];
  if (!p) return null;
  const [cats, imgs, vars] = await Promise.all([
    query<{ id: string; name: string; slug: string }>(
      "select c.id, c.name, c.slug from product_categories pc join categories c on c.id = pc.category_id where pc.product_id = $1 order by c.sort, c.name",
      [p.id],
    ),
    query<{ id: string; storage_key: string; widths: number[]; width: number; height: number; alt: string; color: string }>(
      `select a.id, a.storage_key, a.widths, a.width, a.height, coalesce(nullif(i.alt, ''), $2) as alt, i.color
         from product_images i join media_assets a on a.id = i.asset_id where i.product_id = $1 order by i.is_primary desc, i.sort, i.id`,
      [p.id, p.name],
    ),
    query<{ id: string; size: string; color: string; price_cents: number | null; stock: number; low_stock_threshold: number | null }>(
      "select id, size, color, price_cents, stock, low_stock_threshold from product_variants where product_id = $1 and active order by sort, size, color",
      [p.id],
    ),
  ]);
  const low = opts.lowStockDefault ?? 5;
  const variants: VariantPublic[] = vars.rows.map((v) => {
    const override = v.price_cents !== null;
    const unit = override ? v.price_cents! : (p.sale_price_cents ?? p.price_cents);
    const threshold = v.low_stock_threshold ?? p.low_stock_threshold ?? low;
    const available = !p.track_inventory || v.stock > 0;
    return {
      id: v.id,
      size: v.size,
      color: v.color,
      unit_price_cents: unit,
      original_price_cents: !override && p.sale_price_cents !== null ? p.price_cents : null,
      on_sale: !override && p.sale_price_cents !== null,
      available,
      low_stock_count: p.track_inventory && v.stock > 0 && v.stock <= threshold ? v.stock : null,
    };
  });
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    short_description: p.short_description,
    description_md: p.description_md,
    instructions_md: p.instructions_md,
    size_chart_md: p.size_chart_md,
    status: p.status,
    sku: p.sku,
    tags: p.tags,
    featured: p.featured,
    is_new: p.is_new,
    categories: cats.rows,
    images: imgs.rows,
    variants,
    sizes: sortSizes([...new Set(variants.map((v) => v.size).filter(Boolean))]),
    colors: [...new Set(variants.map((v) => v.color).filter(Boolean))],
  };
}

/** Other published products from the same category (falls back to the newest products). */
export async function relatedProducts(productId: string, limit = 8): Promise<ProductCard[]> {
  const rows = (
    await query<CardRow>(
      `${CARD_SELECT}
        where p.status = 'published' and p.id <> $1
        order by (exists (select 1 from product_categories a join product_categories b on b.category_id = a.category_id where a.product_id = p.id and b.product_id = $1)) desc,
                 p.featured desc, p.published_at desc nulls last
        limit ${Math.min(limit, 24)}`,
      [productId],
    )
  ).rows;
  return rows.map(toCard);
}

/** Every published product slug (for the sitemap). */
export async function publishedSlugs(): Promise<{ slug: string; updated_at: Date }[]> {
  return (await query<{ slug: string; updated_at: Date }>("select slug, updated_at from products where status = 'published' order by updated_at desc limit 5000")).rows;
}
