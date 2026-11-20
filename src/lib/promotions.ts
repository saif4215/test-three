import "server-only";
import { z } from "zod";
import { query, tx, type Db } from "./db";
import { audit, type Actor } from "./audit";
import { UserError } from "./errors";

export interface Promotion {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  min_subtotal_cents: number;
  starts_at: Date | null;
  ends_at: Date | null;
  max_uses: number | null;
  used_count: number;
  active: boolean;
}

const COLS = "id, code, kind, value, min_subtotal_cents, starts_at, ends_at, max_uses, used_count, active";

export const normalizeCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "");

export async function findPromotion(db: Db, code: string, lock = false): Promise<Promotion | null> {
  const r = await db.query<Promotion>(`select ${COLS} from promotions where upper(code) = $1 ${lock ? "for update" : ""}`, [normalizeCode(code)]);
  return r.rows[0] ?? null;
}

/** Checks a code against the cart and returns the discount in cents, or a short reason it can't be used. */
export function evaluatePromotion(p: Promotion | null, subtotalCents: number, now = new Date()): { discountCents: number; error: string | null } {
  const no = (error: string) => ({ discountCents: 0, error });
  if (!p || !p.active) return no("That code isn’t valid.");
  if (p.starts_at && p.starts_at > now) return no("That code isn’t active yet.");
  if (p.ends_at && p.ends_at <= now) return no("That code has expired.");
  if (p.max_uses !== null && p.used_count >= p.max_uses) return no("That code has been used the maximum number of times.");
  if (subtotalCents < p.min_subtotal_cents) return no(`That code needs an order of at least $${(p.min_subtotal_cents / 100).toFixed(2)}.`);
  const raw = p.kind === "percent" ? Math.round((subtotalCents * p.value) / 100) : p.value;
  return { discountCents: Math.min(raw, subtotalCents), error: null };
}

/* ------------------------------------------------------------------ admin */

export const promotionInputSchema = z.object({
  id: z.string().uuid().nullable().default(null),
  code: z.string().trim().min(3, "The code needs at least 3 characters.").max(30).regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, - or _ only."),
  kind: z.enum(["percent", "fixed"]),
  value: z.number().int().min(1, "Enter the discount amount."),
  minSubtotalCents: z.number().int().min(0).default(0),
  startsAt: z.date().nullable().default(null),
  endsAt: z.date().nullable().default(null),
  maxUses: z.number().int().min(1).nullable().default(null),
  active: z.boolean().default(true),
});
export type PromotionInput = z.infer<typeof promotionInputSchema>;

export async function listPromotions(): Promise<Promotion[]> {
  return (await query<Promotion>(`select ${COLS} from promotions order by created_at desc`)).rows;
}
export async function getPromotion(id: string): Promise<Promotion | null> {
  return (await query<Promotion>(`select ${COLS} from promotions where id = $1`, [id])).rows[0] ?? null;
}

export async function savePromotion(raw: unknown, actor: Actor, ip: string | null = null): Promise<string> {
  const parsed = promotionInputSchema.safeParse(raw);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  const i = parsed.data;
  if (i.kind === "percent" && i.value > 100) throw new UserError("A percentage can’t be more than 100.");
  if (i.startsAt && i.endsAt && i.endsAt <= i.startsAt) throw new UserError("“Ends” must be after “Starts”.");
  const code = normalizeCode(i.code);
  return tx(async (c) => {
    const clash = await c.query("select 1 from promotions where upper(code) = $1 and ($2::uuid is null or id <> $2)", [code, i.id]);
    if (clash.rowCount) throw new UserError("A promotion with that code already exists.");
    if (i.id) {
      await c.query("update promotions set code = $2, kind = $3, value = $4, min_subtotal_cents = $5, starts_at = $6, ends_at = $7, max_uses = $8, active = $9 where id = $1", [i.id, code, i.kind, i.value, i.minSubtotalCents, i.startsAt, i.endsAt, i.maxUses, i.active]);
      await audit(actor, "promotion.update", "promotion", i.id, { code }, ip, c);
      return i.id;
    }
    const r = await c.query<{ id: string }>(
      "insert into promotions (code, kind, value, min_subtotal_cents, starts_at, ends_at, max_uses, active) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id",
      [code, i.kind, i.value, i.minSubtotalCents, i.startsAt, i.endsAt, i.maxUses, i.active],
    );
    await audit(actor, "promotion.create", "promotion", r.rows[0].id, { code }, ip, c);
    return r.rows[0].id;
  });
}

export async function deletePromotion(id: string, actor: Actor, ip: string | null = null): Promise<void> {
  const r = await query<{ code: string }>("delete from promotions where id = $1 returning code", [id]);
  if (!r.rowCount) throw new UserError("That promotion no longer exists.");
  await audit(actor, "promotion.delete", "promotion", id, { code: r.rows[0].code }, ip);
}
