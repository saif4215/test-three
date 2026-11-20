import "server-only";
import { env } from "./env";
import { query } from "./db";
import { randomToken, sha256 } from "./crypto";
import { audit } from "./audit";
import { findAdminByEmail, normalizeEmail, setAdminPassword } from "./admins";
import { checkPassword } from "./password-policy";
import { UserError } from "./errors";
import { isFeatureOn } from "./settings";
import { rateLimit, clientIp } from "./rate-limit";
import { sendEmail } from "./email";
import { passwordResetEmail } from "./email-templates";

/** Always answers the same way, so the form can't be used to find out which email addresses belong to staff. */
export async function requestPasswordReset(emailInput: string): Promise<void> {
  const email = normalizeEmail(emailInput);
  const ip = await clientIp();
  const [a, b] = await Promise.all([rateLimit(`reset:ip:${ip}`, 8, 3600), rateLimit(`reset:email:${email}`, 3, 3600)]);
  if (!a.ok || !b.ok) return;
  if (!(await isFeatureOn("email_notifications"))) return;
  const admin = await findAdminByEmail(email);
  if (!admin || !admin.active) return;
  const token = randomToken(32);
  await query("insert into password_resets (admin_id, token_hash, expires_at) values ($1, $2, now() + interval '1 hour')", [admin.id, sha256(token)]);
  const mail = await passwordResetEmail(admin.name, `${env.appUrl}/admin/reset-password?token=${token}`);
  await sendEmail({ to: admin.email, ...mail, template: "password_reset" });
  await audit({ id: admin.id, label: admin.email }, "auth.reset_requested", "admin_user", admin.id, {}, ip);
}

export async function isResetTokenValid(token: string): Promise<boolean> {
  const r = await query("select 1 from password_resets where token_hash = $1 and used_at is null and expires_at > now()", [sha256(token)]);
  return (r.rowCount ?? 0) > 0;
}

export async function completePasswordReset(token: string, password: string): Promise<void> {
  const row = (
    await query<{ id: string; admin_id: string; email: string }>(
      `select r.id, r.admin_id, u.email from password_resets r join admin_users u on u.id = r.admin_id
        where r.token_hash = $1 and r.used_at is null and r.expires_at > now() and u.active`,
      [sha256(token)],
    )
  ).rows[0];
  if (!row) throw new UserError("This reset link has expired or was already used. Request a new one.");
  const problem = checkPassword(password, row.email);
  if (problem) throw new UserError(problem);
  await setAdminPassword(row.admin_id, password, false);
  await query("update password_resets set used_at = now() where id = $1", [row.id]);
  await query("update password_resets set used_at = now() where admin_id = $1 and used_at is null", [row.admin_id]);
  await audit({ id: row.admin_id, label: row.email }, "auth.reset_completed", "admin_user", row.admin_id, {}, await clientIp());
}
