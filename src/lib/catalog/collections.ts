import "server-only";
import { z } from "zod";
import { query, tx } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";
import { slugify } from "../util";

export interface AdminCollection {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: "draft" | "published";
  starts_at: Date | null;
  ends_at: Date | null;
  featured: boolean;
  sort: number;
  product_ids: string[];
  product_count: number;
}

export const collectionInputSchema = z.object({
  id: z.string().uuid().nullable().default(null),
  title: z.string().trim().min(1, "Give the collection a title.").max(80),
  description: z.string().trim().max(500).default(""),
  status: z.enum(["draft", "published"]).default("draft"),
  startsAt: z.date().nullable().default(null),
  endsAt: z.date().nullable().default(null),
  featured: z.boolean().default(false),
  productIds: z.array(z.string().uuid()).max(200).default([]),
});

export async function listAdminCollections(): Promise<AdminCollection[]> {
  return (
    await query<AdminCollection>(
      `select c.id, c.title, c.slug, c.description, c.status, c.starts_at, c.ends_at, c.featured, c.sort,
              coalesce((select array_agg(cp.product_id order by cp.sort) from collection_products cp where cp.collection_id = c.id), '{}') as product_ids,
              (select count(*) from collection_products cp where cp.collection_id = c.id)::int as product_count
         from collections c order by c.sort, c.created_at desc`,
    )
  ).rows;
}

export async function getAdminCollection(id: string): Promise<AdminCollection | null> {
  return (await listAdminCollections()).find((c) => c.id === id) ?? null;
}

export async function saveCollection(raw: unknown, actor: Actor, ip: string | null = null): Promise<string> {
  const parsed = collectionInputSchema.safeParse(raw);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  const i = parsed.data;
  if (i.startsAt && i.endsAt && i.endsAt <= i.startsAt) throw new UserError("“Ends” must be after “Starts”.");
  return tx(async (c) => {
    let id = i.id;
    if (id) {
      const r = await c.query("update collections set title = $2, description = $3, status = $4, starts_at = $5, ends_at = $6, featured = $7 where id = $1", [id, i.title, i.description, i.status, i.startsAt, i.endsAt, i.featured]);
      if (!r.rowCount) throw new UserError("That collection no longer exists.");
    } else {
      let slug = slugify(i.title) || "collection";
      for (let n = 2; (await c.query("select 1 from collections where slug = $1", [slug])).rowCount; n++) slug = `${slugify(i.title)}-${n}`;
      id = (await c.query<{ id: string }>("insert into collections (title, slug, description, status, starts_at, ends_at, featured) values ($1, $2, $3, $4, $5, $6, $7) returning id", [i.title, slug, i.description, i.status, i.startsAt, i.endsAt, i.featured])).rows[0].id;
    }
    await c.query("delete from collection_products where collection_id = $1", [id]);
    for (const [n, pid] of i.productIds.entries()) await c.query("insert into collection_products (collection_id, product_id, sort) values ($1, $2, $3) on conflict do nothing", [id, pid, n]);
    await audit(actor, "collection.save", "collection", id!, { name: i.title }, ip, c);
    return id!;
  });
}

export async function deleteCollection(id: string, actor: Actor, ip: string | null = null): Promise<void> {
  const r = await query<{ title: string }>("delete from collections where id = $1 returning title", [id]);
  if (!r.rowCount) throw new UserError("That collection no longer exists.");
  await audit(actor, "collection.delete", "collection", id, { name: r.rows[0].title }, ip);
}
