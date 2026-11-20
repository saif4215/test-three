import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import { query, tx } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";
import { slugify } from "../util";
import { issueMessage } from "../zod-message";

/* ------------------------------------------------------------------ input validation */

export const variantInputSchema = z.object({
  id: z.string().uuid().nullable().default(null),
  sku: z.string().trim().max(60).default(""),
  size: z.string().trim().max(30).default(""),
  color: z.string().trim().max(40).default(""),
  priceCents: z.number().int().min(0).max(10_000_000).nullable().default(null),
  stock: z.number().int().min(0).max(1_000_000).default(0),
  lowStockThreshold: z.number().int().min(0).max(100_000).nullable().default(null),
  active: z.boolean().default(true),
});

export const imageInputSchema = z.object({
  assetId: z.string().uuid(),
  alt: z.string().trim().max(300).default(""),
  color: z.string().trim().max(40).default(""),
  isPrimary: z.boolean().default(false),
});

export const productInputSchema = z.object({
  id: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1, "Give the product a name.").max(120),
  shortDescription: z.string().trim().max(200).default(""),
  description: z.string().max(20_000).default(""),
  instructions: z.string().max(5_000).default(""),
  sizeChart: z.string().max(10_000).default(""),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  priceCents: z.number().int().min(0, "The price can’t be negative.").max(10_000_000),
  salePriceCents: z.number().int().min(0).max(10_000_000).nullable().default(null),
  sku: z.string().trim().max(60).default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  featured: z.boolean().default(false),
  trackInventory: z.boolean().default(true),
  lowStockThreshold: z.number().int().min(0).max(100_000).nullable().default(null),
  categoryIds: z.array(z.string().uuid()).max(12).default([]),
  images: z.array(imageInputSchema).max(16).default([]),
  variants: z.array(variantInputSchema).max(200).default([]),
});
export type ProductInput = z.infer<typeof productInputSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;

/** Cleans a (possibly hand-built) product input and explains any problem in plain words. */
export function prepareProductInput(raw: unknown): ProductInput {
  const parsed = productInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new UserError(issueMessage(parsed.error.issues[0]));
  }
  const input = parsed.data;
  if (input.salePriceCents !== null && input.salePriceCents >= input.priceCents) throw new UserError("The sale price must be lower than the regular price.");
  if (input.variants.length === 0) input.variants = [variantInputSchema.parse({ stock: 0 })];
  const seen = new Set<string>();
  for (const v of input.variants) {
    const key = `${v.size.toLowerCase()}|${v.color.toLowerCase()}`;
    if (seen.has(key)) throw new UserError(`Two options are both “${[v.size, v.color].filter(Boolean).join(" / ") || "(no size or colour)"}”. Each size and colour combination can only appear once.`);
    seen.add(key);
  }
  if (input.status === "published") {
    if (input.images.some((i) => !i.alt)) throw new UserError("Describe each photo in a few words (for people who use screen readers) before publishing.");
    if (!input.variants.some((v) => v.active)) throw new UserError("Publish at least one active size/colour option.");
  }
  input.images = input.images.map((img, i) => ({ ...img, isPrimary: i === 0 }));
  return input;
}

/* ------------------------------------------------------------------ saving */

async function uniqueSlug(c: PoolClient, name: string, ignoreId: string | null): Promise<string> {
  const base = slugify(name) || "product";
  for (let n = 1; n < 500; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const r = await c.query("select 1 from products where slug = $1 and ($2::uuid is null or id <> $2)", [candidate, ignoreId]);
    if (!r.rowCount) return candidate;
  }
  throw new UserError("Couldn’t find a free web address for that name. Try a different name.");
}

export async function saveProductTx(c: PoolClient, input: ProductInput, actor: Actor, ip: string | null = null): Promise<{ id: string; slug: string }> {
  let id = input.id;
  let slug: string;
  if (id) {
    const cur = await c.query<{ slug: string; name: string; status: string }>("select slug, name, status from products where id = $1 for update", [id]);
    if (!cur.rowCount) throw new UserError("That product no longer exists.");
    slug = cur.rows[0].slug;
    await c.query(
      `update products set name = $2, short_description = $3, description_md = $4, instructions_md = $5, size_chart_md = $6, status = $7,
         price_cents = $8, sale_price_cents = $9, sku = $10, tags = $11, featured = $12, track_inventory = $13, low_stock_threshold = $14,
         updated_at = now(), published_at = case when $7 = 'published' then coalesce(published_at, now()) else published_at end
       where id = $1`,
      [id, input.name, input.shortDescription, input.description, input.instructions, input.sizeChart, input.status, input.priceCents, input.salePriceCents, input.sku, input.tags, input.featured, input.trackInventory, input.lowStockThreshold],
    );
  } else {
    slug = await uniqueSlug(c, input.name, null);
    const ins = await c.query<{ id: string }>(
      `insert into products (name, slug, short_description, description_md, instructions_md, size_chart_md, status, price_cents, sale_price_cents, sku, tags, featured, track_inventory, low_stock_threshold, published_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, case when $7 = 'published' then now() end) returning id`,
      [input.name, slug, input.shortDescription, input.description, input.instructions, input.sizeChart, input.status, input.priceCents, input.salePriceCents, input.sku, input.tags, input.featured, input.trackInventory, input.lowStockThreshold],
    );
    id = ins.rows[0].id;
  }

  await c.query("delete from product_categories where product_id = $1", [id]);
  for (const cid of input.categoryIds) await c.query("insert into product_categories (product_id, category_id) values ($1, $2) on conflict do nothing", [id, cid]);

  await c.query("delete from product_images where product_id = $1", [id]);
  for (const [i, img] of input.images.entries()) {
    await c.query("insert into product_images (product_id, asset_id, alt, color, sort, is_primary) values ($1, $2, $3, $4, $5, $6)", [id, img.assetId, img.alt, img.color, i, img.isPrimary]);
  }

  // Options: update the ones that already exist (so order history and back-in-stock requests keep working), add new ones, remove the rest.
  const existing = new Set((await c.query<{ id: string }>("select id from product_variants where product_id = $1", [id])).rows.map((r) => r.id));
  const keep = new Set<string>();
  for (const v of input.variants) {
    if (v.id && existing.has(v.id)) {
      // Move through a temporary key so swapping two options' names in one save cannot trip the unique constraint.
      await c.query("update product_variants set size = $2, color = $3 where id = $1", [v.id, `~${v.id}`, `~${v.id}`]);
      keep.add(v.id);
    }
  }
  await c.query("delete from product_variants where product_id = $1 and not (id = any($2::uuid[]))", [id, [...keep]]);
  for (const [i, v] of input.variants.entries()) {
    if (v.id && keep.has(v.id)) {
      await c.query(
        "update product_variants set sku = $2, size = $3, color = $4, price_cents = $5, stock = $6, low_stock_threshold = $7, active = $8, sort = $9 where id = $1",
        [v.id, v.sku, v.size, v.color, v.priceCents, v.stock, v.lowStockThreshold, v.active, i],
      );
    } else {
      await c.query(
        "insert into product_variants (product_id, sku, size, color, price_cents, stock, low_stock_threshold, active, sort) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [id, v.sku, v.size, v.color, v.priceCents, v.stock, v.lowStockThreshold, v.active, i],
      );
    }
  }
  await audit(actor, input.id ? "product.update" : "product.create", "product", id!, { name: input.name, status: input.status }, ip, c);
  return { id: id!, slug };
}

export async function saveProduct(raw: unknown, actor: Actor, ip: string | null = null): Promise<{ id: string; slug: string }> {
  const input = prepareProductInput(raw);
  try {
    return await tx((c) => saveProductTx(c, input, actor, ip));
  } catch (e) {
    throw translateProductSaveError(e);
  }
}

export function translateProductSaveError(e: unknown): unknown {
  const code = (e as { code?: string; constraint?: string }).code;
  const constraint = (e as { constraint?: string }).constraint ?? "";
  if (code === "23505" && constraint.includes("product_variants")) return new UserError("Two options share the same size and colour. Each combination can only appear once.");
  if (code === "23505") return new UserError("Something with that name already exists.");
  if (code === "23503") return new UserError("One of the photos or categories was removed while you were editing. Reload the page and try again.");
  return e;
}

/* ------------------------------------------------------------------ status, copy, delete */

export async function setProductStatus(id: string, status: "draft" | "published" | "archived", actor: Actor, ip: string | null = null): Promise<void> {
  await tx(async (c) => {
    if (status === "published") {
      const ok = await c.query("select 1 from product_variants where product_id = $1 and active limit 1", [id]);
      if (!ok.rowCount) throw new UserError("Add at least one active size/colour option before publishing.");
      const noAlt = await c.query("select 1 from product_images where product_id = $1 and btrim(alt) = '' limit 1", [id]);
      if (noAlt.rowCount) throw new UserError("Describe each photo in a few words (for screen readers) before publishing.");
    }
    const r = await c.query(
      "update products set status = $2, updated_at = now(), published_at = case when $2 = 'published' then coalesce(published_at, now()) else published_at end where id = $1",
      [id, status],
    );
    if (!r.rowCount) throw new UserError("That product no longer exists.");
    await audit(actor, `product.${status === "published" ? "publish" : status === "archived" ? "archive" : "unpublish"}`, "product", id, {}, ip, c);
  });
}

export async function duplicateProduct(id: string, actor: Actor, ip: string | null = null): Promise<string> {
  return tx(async (c) => {
    const src = (await c.query("select * from products where id = $1", [id])).rows[0];
    if (!src) throw new UserError("That product no longer exists.");
    const name = `${src.name} (copy)`;
    const slug = await uniqueSlug(c, name, null);
    const ins = await c.query<{ id: string }>(
      `insert into products (name, slug, short_description, description_md, instructions_md, size_chart_md, status, price_cents, sale_price_cents, sku, tags, featured, track_inventory, low_stock_threshold)
       values ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9, $10, false, $11, $12) returning id`,
      [name, slug, src.short_description, src.description_md, src.instructions_md, src.size_chart_md, src.price_cents, src.sale_price_cents, src.sku, src.tags, src.track_inventory, src.low_stock_threshold],
    );
    const nid = ins.rows[0].id;
    await c.query("insert into product_categories (product_id, category_id) select $2, category_id from product_categories where product_id = $1", [id, nid]);
    await c.query("insert into product_images (product_id, asset_id, alt, color, sort, is_primary) select $2, asset_id, alt, color, sort, is_primary from product_images where product_id = $1", [id, nid]);
    await c.query(
      "insert into product_variants (product_id, sku, size, color, price_cents, stock, low_stock_threshold, active, sort) select $2, '', size, color, price_cents, 0, low_stock_threshold, active, sort from product_variants where product_id = $1",
      [id, nid],
    );
    await audit(actor, "product.duplicate", "product", nid, { from: id }, ip, c);
    return nid;
  });
}

export async function deleteProduct(id: string, actor: Actor, ip: string | null = null): Promise<void> {
  await tx(async (c) => {
    const r = await c.query<{ name: string }>("delete from products where id = $1 returning name", [id]);
    if (!r.rowCount) throw new UserError("That product no longer exists.");
    await audit(actor, "product.delete", "product", id, { name: r.rows[0].name }, ip, c);
  });
}

/* ------------------------------------------------------------------ admin lists */

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "published" | "archived";
  price_cents: number;
  sale_price_cents: number | null;
  featured: boolean;
  is_demo: boolean;
  track_inventory: boolean;
  updated_at: Date;
  variant_count: number;
  total_stock: number;
  low_stock: boolean;
  out_of_stock: boolean;
  image: { storage_key: string; widths: number[] } | null;
}

export async function listAdminProducts(f: { q?: string; status?: string; category?: string; stock?: string; page?: number; pageSize?: number } = {}) {
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where: string[] = [];
  if (f.q?.trim()) {
    const like = p(`%${f.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    where.push(`(p.name ilike ${like} or p.sku ilike ${like} or exists (select 1 from product_variants v where v.product_id = p.id and v.sku ilike ${like}))`);
  }
  if (f.status && ["draft", "published", "archived"].includes(f.status)) where.push(`p.status = ${p(f.status)}`);
  if (f.category) where.push(`exists (select 1 from product_categories pc where pc.product_id = p.id and pc.category_id = ${p(f.category)}::uuid)`);
  const pageSize = Math.min(f.pageSize ?? 25, 100);
  const page = Math.max(f.page ?? 1, 1);
  const base = `
    select p.id, p.name, p.slug, p.status, p.price_cents, p.sale_price_cents, p.featured, p.is_demo, p.track_inventory, p.updated_at,
      (select count(*) from product_variants v where v.product_id = p.id)::int as variant_count,
      (select coalesce(sum(v.stock), 0) from product_variants v where v.product_id = p.id and v.active)::int as total_stock,
      (select coalesce(bool_or(v.stock <= coalesce(v.low_stock_threshold, p.low_stock_threshold, 5) and v.stock > 0), false) from product_variants v where v.product_id = p.id and v.active) as low_stock,
      (select not coalesce(bool_or(v.stock > 0), false) from product_variants v where v.product_id = p.id and v.active) as out_of_stock,
      (select jsonb_build_object('storage_key', a.storage_key, 'widths', a.widths) from product_images i join media_assets a on a.id = i.asset_id where i.product_id = p.id order by i.is_primary desc, i.sort limit 1) as image
    from products p ${where.length ? `where ${where.join(" and ")}` : ""}`;
  const stockWhere = f.stock === "out" ? "where out_of_stock and track_inventory" : f.stock === "low" ? "where low_stock and track_inventory" : "";
  const filtered = `select * from (${base}) x ${stockWhere}`;
  const total = Number((await query<{ n: string }>(`select count(*) as n from (${filtered}) y`, params)).rows[0].n);
  const items = (await query<AdminProductRow>(`${filtered} order by updated_at desc limit ${pageSize} offset ${(page - 1) * pageSize}`, params)).rows;
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export interface AdminProductFull {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  description_md: string;
  instructions_md: string;
  size_chart_md: string;
  status: "draft" | "published" | "archived";
  price_cents: number;
  sale_price_cents: number | null;
  sku: string;
  tags: string[];
  featured: boolean;
  track_inventory: boolean;
  low_stock_threshold: number | null;
  is_demo: boolean;
  category_ids: string[];
  images: { asset_id: string; alt: string; color: string; storage_key: string; widths: number[] }[];
  variants: { id: string; sku: string; size: string; color: string; price_cents: number | null; stock: number; low_stock_threshold: number | null; active: boolean }[];
}

export async function getAdminProduct(id: string): Promise<AdminProductFull | null> {
  const r = await query<Omit<AdminProductFull, "category_ids" | "images" | "variants">>(
    `select id, name, slug, short_description, description_md, instructions_md, size_chart_md, status, price_cents, sale_price_cents, sku, tags, featured, track_inventory, low_stock_threshold, is_demo
       from products where id = $1`,
    [id],
  );
  const p = r.rows[0];
  if (!p) return null;
  const [cats, imgs, vars] = await Promise.all([
    query<{ category_id: string }>("select category_id from product_categories where product_id = $1", [id]),
    query<AdminProductFull["images"][number]>(
      "select i.asset_id, i.alt, i.color, a.storage_key, a.widths from product_images i join media_assets a on a.id = i.asset_id where i.product_id = $1 order by i.is_primary desc, i.sort, i.id",
      [id],
    ),
    query<AdminProductFull["variants"][number]>("select id, sku, size, color, price_cents, stock, low_stock_threshold, active from product_variants where product_id = $1 order by sort, size, color", [id]),
  ]);
  return { ...p, category_ids: cats.rows.map((c) => c.category_id), images: imgs.rows, variants: vars.rows };
}

/* ------------------------------------------------------------------ inventory */

export interface InventoryRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  product_status: string;
  size: string;
  color: string;
  sku: string;
  stock: number;
  threshold: number;
  track_inventory: boolean;
  active: boolean;
}

export async function listInventory(f: { q?: string; low?: boolean; defaultThreshold: number }): Promise<InventoryRow[]> {
  const params: unknown[] = [f.defaultThreshold];
  const where = ["p.status <> 'archived'"];
  if (f.q?.trim()) {
    params.push(`%${f.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    where.push(`(p.name ilike $2 or v.sku ilike $2 or v.size ilike $2 or v.color ilike $2)`);
  }
  const rows = (
    await query<InventoryRow>(
      `select v.id as variant_id, p.id as product_id, p.name as product_name, p.status as product_status, v.size, v.color, v.sku, v.stock,
              coalesce(v.low_stock_threshold, p.low_stock_threshold, $1)::int as threshold, p.track_inventory, v.active
         from product_variants v join products p on p.id = v.product_id
        where ${where.join(" and ")} order by p.name, v.sort, v.size, v.color limit 1000`,
      params,
    )
  ).rows;
  return f.low ? rows.filter((r) => r.track_inventory && r.active && r.stock <= r.threshold) : rows;
}

export async function setStock(variantId: string, stock: number, actor: Actor, ip: string | null = null): Promise<void> {
  if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) throw new UserError("Stock must be a whole number, 0 or more.");
  await tx(async (c) => {
    const cur = await c.query<{ stock: number; name: string }>(
      "select v.stock, p.name from product_variants v join products p on p.id = v.product_id where v.id = $1 for update of v",
      [variantId],
    );
    if (!cur.rowCount) throw new UserError("That option no longer exists.");
    if (cur.rows[0].stock === stock) return;
    await c.query("update product_variants set stock = $2 where id = $1", [variantId, stock]);
    await audit(actor, "inventory.set", "variant", variantId, { product: cur.rows[0].name, from: cur.rows[0].stock, to: stock }, ip, c);
  });
}

/* ------------------------------------------------------------------ categories */

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  sort: number;
  show_on_home: boolean;
  image_asset_id: string | null;
  product_count: number;
}

export async function listAdminCategories(): Promise<AdminCategory[]> {
  return (
    await query<AdminCategory>(
      `select c.id, c.name, c.slug, c.description, c.sort, c.show_on_home, c.image_asset_id,
              (select count(*) from product_categories pc where pc.category_id = c.id)::int as product_count
         from categories c order by c.sort, c.name`,
    )
  ).rows;
}

export async function saveCategory(input: { id?: string | null; name: string; description?: string; sort?: number; showOnHome?: boolean; imageAssetId?: string | null }, actor: Actor, ip: string | null = null): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new UserError("Give the category a name.");
  if (name.length > 80) throw new UserError("That name is too long (80 characters at most).");
  return tx(async (c) => {
    if (input.id) {
      await c.query("update categories set name = $2, description = $3, sort = $4, show_on_home = $5, image_asset_id = $6 where id = $1", [
        input.id, name, (input.description ?? "").slice(0, 500), input.sort ?? 0, input.showOnHome ?? true, input.imageAssetId ?? null,
      ]);
      await audit(actor, "category.update", "category", input.id, { name }, ip, c);
      return input.id;
    }
    let slug = slugify(name) || "category";
    for (let n = 2; (await c.query("select 1 from categories where slug = $1", [slug])).rowCount; n++) slug = `${slugify(name)}-${n}`;
    const r = await c.query<{ id: string }>(
      "insert into categories (name, slug, description, sort, show_on_home, image_asset_id) values ($1, $2, $3, $4, $5, $6) returning id",
      [name, slug, (input.description ?? "").slice(0, 500), input.sort ?? 0, input.showOnHome ?? true, input.imageAssetId ?? null],
    );
    await audit(actor, "category.create", "category", r.rows[0].id, { name }, ip, c);
    return r.rows[0].id;
  });
}

export async function deleteCategory(id: string, actor: Actor, ip: string | null = null): Promise<void> {
  await tx(async (c) => {
    const r = await c.query<{ name: string }>("delete from categories where id = $1 returning name", [id]);
    if (!r.rowCount) throw new UserError("That category no longer exists.");
    await audit(actor, "category.delete", "category", id, { name: r.rows[0].name }, ip, c);
  });
}
