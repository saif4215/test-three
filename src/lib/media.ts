import "server-only";
import crypto from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { query } from "./db";
import { deleteObject, putObject } from "./storage";
import { UserError } from "./errors";

export interface MediaAsset {
  id: string;
  storage_key: string;
  widths: number[];
  width: number;
  height: number;
  alt: string;
  kind: "upload" | "banner" | "logo" | "mockup";
}

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 8000;
const MIN_SIDE = 64;
const WIDTHS = [400, 800, 1600];
const OK_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif"]);

/**
 * Accepts a photo, checks it really is a picture (by its content, not its file name), removes location/camera data,
 * and stores web-sized WebP copies. SVG and anything else that can carry scripts is refused.
 */
export async function saveImage(input: Buffer, opts: { alt?: string; kind?: MediaAsset["kind"] } = {}): Promise<MediaAsset> {
  if (input.length === 0) throw new UserError("That file is empty.");
  if (input.length > MAX_BYTES) throw new UserError("That image is larger than 10 MB. Please use a smaller photo.");
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_SIDE * MAX_SIDE }).metadata();
  } catch {
    throw new UserError("That file isn’t a picture we can use. Upload a JPG, PNG, WebP or GIF.");
  }
  if (!meta.format || !OK_FORMATS.has(meta.format) || !meta.width || !meta.height) throw new UserError("That file isn’t a picture we can use. Upload a JPG, PNG, WebP or GIF.");
  if (meta.width > MAX_SIDE || meta.height > MAX_SIDE) throw new UserError("That image is too large (more than 8000 pixels on a side).");
  if (meta.width < MIN_SIDE || meta.height < MIN_SIDE) throw new UserError(`That picture is too small. Use one at least ${MIN_SIDE} pixels wide and tall.`);

  const oriented = sharp(input, { limitInputPixels: MAX_SIDE * MAX_SIDE }).rotate();
  const swap = (meta.orientation ?? 1) >= 5;
  const srcWidth = swap ? meta.height : meta.width;
  const srcHeight = swap ? meta.width : meta.height;
  const widths = WIDTHS.filter((w) => w <= srcWidth);
  if (widths.length === 0 || widths[widths.length - 1] < srcWidth) {
    if (srcWidth < WIDTHS[WIDTHS.length - 1]) widths.push(srcWidth);
  }
  if (widths.length === 0) widths.push(srcWidth);

  const key = `${new Date().getUTCFullYear()}/${crypto.randomBytes(12).toString("hex")}`;
  let bytes = 0;
  for (const w of widths) {
    const out = await oriented.clone().resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    bytes += out.length;
    await putObject(`${key}/w${w}.webp`, out);
  }
  const top = widths[widths.length - 1];
  const r = await query<MediaAsset>(
    `insert into media_assets (storage_key, widths, width, height, bytes, alt, kind) values ($1, $2, $3, $4, $5, $6, $7)
     returning id, storage_key, widths, width, height, alt, kind`,
    [key, widths, top, Math.round((srcHeight * top) / srcWidth), bytes, (opts.alt ?? "").slice(0, 300), opts.kind ?? "upload"],
  );
  return r.rows[0];
}

export async function getAsset(id: string | null | undefined): Promise<MediaAsset | null> {
  if (!id) return null;
  const r = await query<MediaAsset>("select id, storage_key, widths, width, height, alt, kind from media_assets where id = $1", [id]);
  return r.rows[0] ?? null;
}

export async function getAssets(ids: string[]): Promise<Map<string, MediaAsset>> {
  if (ids.length === 0) return new Map();
  const r = await query<MediaAsset>("select id, storage_key, widths, width, height, alt, kind from media_assets where id = any($1::uuid[])", [ids]);
  return new Map(r.rows.map((a) => [a.id, a]));
}

/**
 * Deletes uploaded pictures nothing uses any more (a day after upload, so a picture just added to a form that has not
 * been saved yet is not swept away). Returns how many were removed.
 */
export async function purgeOrphanedAssets(): Promise<number> {
  const candidates = (
    await query<{ id: string; storage_key: string; widths: number[] }>(
      `select a.id, a.storage_key, a.widths from media_assets a
        where a.created_at < now() - interval '1 day'
          and not exists (select 1 from product_images p where p.asset_id = a.id)
          and not exists (select 1 from categories c where c.image_asset_id = a.id)
          and not exists (select 1 from order_items o where o.image_asset_id = a.id)
          and not exists (select 1 from settings s where s.value::text like '%' || a.id::text || '%')
          and not exists (select 1 from site_content sc where sc.draft::text like '%' || a.id::text || '%' or sc.published::text like '%' || a.id::text || '%')`,
    )
  ).rows;
  for (const a of candidates) {
    for (const w of a.widths) await deleteObject(`${a.storage_key}/w${w}.webp`);
    await query("delete from media_assets where id = $1", [a.id]);
  }
  return candidates.length;
}
