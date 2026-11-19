import "server-only";
import crypto from "node:crypto";
import { z } from "zod";
import { env } from "./env";
import { query } from "./db";
import { hmac, sha256 } from "./crypto";
import { UserError } from "./errors";
import { isFeatureOn } from "./settings";
import { rateLimit } from "./rate-limit";
import { sendEmail } from "./email";
import { restockAvailableEmail, restockVerifyEmail } from "./email-templates";

/**
 * Back-in-stock alerts, double opt-in: nothing is stored as "active" until the person clicks the link in the email,
 * and exactly one message is sent when the item returns. The links are derived from the request id with the server
 * secret, so they cannot be guessed and nothing secret has to be stored.
 */
const tokenFor = (kind: "verify" | "unsub", id: string) => hmac(`restock:${kind}:${id}`).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export async function requestRestock(variantId: string, emailInput: string, consent: boolean, ipKey: string): Promise<string> {
  if (!(await isFeatureOn("restock_alerts"))) throw new UserError("Back-in-stock alerts aren’t available right now.");
  if (!consent) throw new UserError("Please tick the box to agree to receive the email.");
  const email = emailSchema.safeParse(emailInput);
  if (!email.success) throw new UserError("Please enter a valid email address.");
  const rl = await rateLimit(`restock:${ipKey}`, 8, 3600);
  if (!rl.ok) throw new UserError("Too many requests. Please try again later.");
  const v = await query<{ size: string; color: string; name: string; available: boolean }>(
    `select v.size, v.color, p.name, (not p.track_inventory or v.stock > 0) as available
       from product_variants v join products p on p.id = v.product_id where v.id = $1 and v.active and p.status = 'published'`,
    [variantId],
  );
  const row = v.rows[0];
  if (!row) throw new UserError("That item is no longer available.");
  if (row.available) throw new UserError("That option is in stock right now.");

  const GENERIC = "Thanks! Check your email and confirm to finish setting up the alert.";
  const existing = await query<{ id: string; status: string }>("select id, status from restock_requests where variant_id = $1 and lower(email) = $2", [variantId, email.data]);
  let id = existing.rows[0]?.id;
  if (existing.rows[0]?.status === "active") return GENERIC;
  if (!id) {
    id = crypto.randomUUID();
    await query("insert into restock_requests (id, variant_id, email, verify_token_hash, unsubscribe_token_hash) values ($1, $2, $3, $4, $5)", [
      id, variantId, email.data, sha256(tokenFor("verify", id)), sha256(tokenFor("unsub", id)),
    ]);
  } else {
    await query("update restock_requests set status = 'pending', notified_at = null where id = $1", [id]);
  }
  const mail = await restockVerifyEmail(row.name, [row.size, row.color].filter(Boolean).join(" / "), `${env.appUrl}/restock/verify?token=${tokenFor("verify", id)}`);
  await sendEmail({ to: email.data, ...mail, template: "restock_verify" });
  return GENERIC;
}

export async function verifyRestock(token: string): Promise<boolean> {
  const r = await query("update restock_requests set status = 'active' where verify_token_hash = $1 and status = 'pending'", [sha256(token)]);
  if (r.rowCount) return true;
  const already = await query("select 1 from restock_requests where verify_token_hash = $1 and status in ('active', 'notified')", [sha256(token)]);
  return (already.rowCount ?? 0) > 0;
}

export async function unsubscribeRestock(token: string): Promise<boolean> {
  const r = await query("update restock_requests set status = 'unsubscribed' where unsubscribe_token_hash = $1 and status <> 'unsubscribed'", [sha256(token)]);
  return (r.rowCount ?? 0) > 0;
}

/** Sends the one-time "back in stock" message for every confirmed request whose option can be bought again. */
export async function notifyRestocked(): Promise<number> {
  if (!(await isFeatureOn("restock_alerts"))) return 0;
  const due = (
    await query<{ id: string; email: string; name: string; slug: string; size: string; color: string }>(
      `select r.id, r.email, p.name, p.slug, v.size, v.color from restock_requests r
         join product_variants v on v.id = r.variant_id join products p on p.id = v.product_id
        where r.status = 'active' and v.active and p.status = 'published' and (not p.track_inventory or v.stock > 0) limit 200`,
    )
  ).rows;
  let sent = 0;
  for (const d of due) {
    const claimed = await query("update restock_requests set status = 'notified', notified_at = now() where id = $1 and status = 'active'", [d.id]);
    if (!claimed.rowCount) continue;
    const mail = await restockAvailableEmail(d.name, [d.size, d.color].filter(Boolean).join(" / "), `${env.appUrl}/products/${d.slug}`, `${env.appUrl}/restock/unsubscribe?token=${tokenFor("unsub", d.id)}`);
    const res = await sendEmail({ to: d.email, ...mail, template: "restock_available" });
    if (res.sent) sent++;
  }
  return sent;
}
