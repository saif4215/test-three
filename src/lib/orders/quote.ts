import "server-only";
import { z } from "zod";
import { pool, type Db } from "../db";
import { getFeatures, loadStoreSettings, orderingStatus, type Features, type OrderingStatus, type StoreSettings } from "../settings";
import { evaluatePromotion, findPromotion } from "../promotions";
import type { CardImage } from "../catalog/types";

/**
 * The single place prices are decided. The browser sends only WHICH options and HOW MANY; every price, discount, fee
 * and total comes from the database here, again at checkout, so a tampered request can never change what is charged.
 */
export const cartItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(1000),
});
export const cartItemsSchema = z.array(cartItemSchema).max(100);
export type CartItemInput = z.infer<typeof cartItemSchema>;

export interface QuoteLine {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantLabel: string;
  sku: string;
  unitPriceCents: number;
  originalUnitPriceCents: number | null;
  onSale: boolean;
  quantity: number;
  lineTotalCents: number;
  /** The most that can be ordered (stock or the store's limit), or null if unlimited. */
  maxQuantity: number | null;
  image: CardImage | null;
  imageAssetId: string | null;
  issue: string | null;
}

export interface FulfillmentChoice {
  id: string;
  label: string;
  type: string;
  feeCents: number;
  instructions: string;
}

export interface Quote {
  ok: boolean;
  lines: QuoteLine[];
  issues: string[];
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  totalCents: number;
  promoCode: string | null;
  promoError: string | null;
  promotionsEnabled: boolean;
  modes: OrderingStatus["modes"];
  ordering: OrderingStatus;
  fulfillment: FulfillmentChoice[];
  chosenFulfillment: FulfillmentChoice | null;
}

interface VariantRow {
  variant_id: string;
  product_id: string;
  slug: string;
  name: string;
  size: string;
  color: string;
  sku: string;
  psku: string;
  vprice: number | null;
  price_cents: number;
  sale_price_cents: number | null;
  stock: number;
  track_inventory: boolean;
  v_active: boolean;
  status: string;
  img_id: string | null;
  img_key: string | null;
  img_widths: number[] | null;
  img_w: number | null;
  img_h: number | null;
  img_alt: string | null;
}

export interface PriceOptions {
  promoCode?: string | null;
  fulfillmentId?: string | null;
  /** Lock the option rows so two checkouts cannot both take the last item. Only inside a transaction. */
  forUpdate?: boolean;
  now?: Date;
}

export async function priceCart(
  db: Db,
  rawItems: CartItemInput[],
  ctx: { features: Features; settings: StoreSettings },
  opts: PriceOptions = {},
): Promise<Quote> {
  const { features, settings } = ctx;
  const now = opts.now ?? new Date();
  // Merge duplicates (the same option added twice) and cap to the store's limit.
  const merged = new Map<string, number>();
  for (const i of rawItems) merged.set(i.variantId, (merged.get(i.variantId) ?? 0) + i.quantity);
  const ids = [...merged.keys()];
  const rows = ids.length
    ? (
        await db.query<VariantRow>(
          `select v.id as variant_id, p.id as product_id, p.slug, p.name, v.size, v.color, v.sku, p.sku as psku, v.price_cents as vprice, p.price_cents, p.sale_price_cents,
                  v.stock, p.track_inventory, v.active as v_active, p.status,
                  img.id as img_id, img.storage_key as img_key, img.widths as img_widths, img.width as img_w, img.height as img_h, img.alt as img_alt
             from product_variants v join products p on p.id = v.product_id
             left join lateral (
               select a.id, a.storage_key, a.widths, a.width, a.height, coalesce(nullif(i.alt, ''), p.name) as alt
                 from product_images i join media_assets a on a.id = i.asset_id
                where i.product_id = p.id order by (i.color <> '' and lower(i.color) = lower(v.color)) desc, i.is_primary desc, i.sort limit 1
             ) img on true
            where v.id = any($1::uuid[]) ${opts.forUpdate ? "for update of v" : ""}`,
          [ids],
        )
      ).rows
    : [];
  const byId = new Map(rows.map((r) => [r.variant_id, r]));

  const lines: QuoteLine[] = [];
  const issues: string[] = [];
  for (const [variantId, wanted] of merged) {
    const r = byId.get(variantId);
    if (!r || r.status !== "published" || !r.v_active) continue; // gone: the page drops it from the bag
    const label = [r.size, r.color].filter(Boolean).join(" / ");
    const override = r.vprice !== null;
    const unit = override ? r.vprice! : (r.sale_price_cents ?? r.price_cents);
    const limit = settings.maxQuantityPerLine;
    const stockCap = r.track_inventory ? r.stock : null;
    const cap = stockCap === null ? limit : Math.min(limit, stockCap);
    let quantity = wanted;
    let issue: string | null = null;
    if (r.track_inventory && r.stock <= 0) {
      issue = `${r.name}${label ? ` (${label})` : ""} is out of stock.`;
      quantity = wanted;
    } else if (wanted > cap) {
      issue = stockCap !== null && stockCap < limit ? `Only ${stockCap} of ${r.name}${label ? ` (${label})` : ""} ${stockCap === 1 ? "is" : "are"} available.` : `You can order up to ${limit} of ${r.name}${label ? ` (${label})` : ""}.`;
    }
    if (issue) issues.push(issue);
    lines.push({
      variantId,
      productId: r.product_id,
      slug: r.slug,
      name: r.name,
      variantLabel: label,
      sku: r.sku || r.psku,
      unitPriceCents: unit,
      originalUnitPriceCents: !override && r.sale_price_cents !== null ? r.price_cents : null,
      onSale: !override && r.sale_price_cents !== null,
      quantity,
      lineTotalCents: unit * quantity,
      maxQuantity: stockCap === null ? limit : cap,
      image: r.img_id ? { id: r.img_id, storage_key: r.img_key!, widths: r.img_widths!, width: r.img_w!, height: r.img_h!, alt: r.img_alt! } : null,
      imageAssetId: r.img_id,
      issue,
    });
  }

  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);

  // Promotions
  let discountCents = 0;
  let promoCode: string | null = null;
  let promoError: string | null = null;
  if (opts.promoCode?.trim()) {
    if (!features.promotions) promoError = "Discount codes aren’t available right now.";
    else {
      const promo = await findPromotion(db, opts.promoCode, !!opts.forUpdate);
      const res = evaluatePromotion(promo, subtotalCents, now);
      if (res.error) promoError = res.error;
      else {
        discountCents = res.discountCents;
        promoCode = promo!.code;
      }
    }
  }

  // Pickup / delivery options and their fees
  const fulfillment: FulfillmentChoice[] = settings.fulfillmentMethods
    .filter((m) => m.enabled)
    .map((m) => ({ id: m.id, label: m.label, type: m.type, feeCents: m.feeCents, instructions: m.instructions }));
  const chosen = fulfillment.find((f) => f.id === opts.fulfillmentId) ?? (fulfillment.length === 1 ? fulfillment[0] : null);
  const feeCents = chosen && lines.length ? chosen.feeCents : 0;
  const totalCents = Math.max(0, subtotalCents - discountCents + feeCents);
  const ordering = orderingStatus(features, settings, now);

  return {
    ok: lines.length > 0 && issues.length === 0,
    lines,
    issues,
    subtotalCents,
    discountCents,
    feeCents,
    totalCents,
    promoCode,
    promoError,
    promotionsEnabled: features.promotions,
    modes: ordering.modes,
    ordering,
    fulfillment,
    chosenFulfillment: chosen,
  };
}

/** The read-only quote shown in the bag and at checkout (no locks). */
export async function quoteCart(items: CartItemInput[], opts: PriceOptions = {}): Promise<Quote> {
  const [features, settings] = await Promise.all([getFeatures(), loadStoreSettings()]);
  return priceCart(pool(), items, { features, settings }, opts);
}
