import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./env";
import { query } from "./db";
import { randomToken, sha256, verifyPassword } from "./crypto";
import { findAdminByEmail, normalizeEmail } from "./admins";
import { audit } from "./audit";
import { clientIp, rateLimit, resetRateLimit } from "./rate-limit";
import { can, type Permission, type Role } from "./permissions";

/** Administrator sessions: a random token in an HttpOnly cookie; only its SHA-256 is stored, so a database leak cannot be replayed. */
export const cookieName = () => (env.secureCookies ? "__Host-icsi_admin" : "icsi_admin");

const SESSION_DAYS = 7;
const IDLE_HOURS = 8;
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export interface AdminSession {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  sessionId: string;
}

export async function startAdminSession(adminId: string): Promise<void> {
  const token = randomToken(32);
  const h = await headers();
  await query("insert into admin_sessions (admin_id, token_hash, expires_at, ip, user_agent) values ($1, $2, now() + make_interval(days => $3), $4, $5)", [
    adminId,
    sha256(token),
    SESSION_DAYS,
    await clientIp(),
    (h.get("user-agent") ?? "").slice(0, 300),
  ]);
  (await cookies()).set(cookieName(), token, {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

/** The signed-in administrator for this request, or null. Cheap to call many times (memoised per request). */
export const getAdmin = cache(async (): Promise<AdminSession | null> => {
  const token = (await cookies()).get(cookieName())?.value;
  if (!token) return null;
  const r = await query<{ session_id: string; last_seen_at: Date; id: string; email: string; name: string; role: Role; must_change_password: boolean }>(
    `select s.id as session_id, s.last_seen_at, u.id, u.email, u.name, u.role, u.must_change_password
       from admin_sessions s join admin_users u on u.id = s.admin_id
      where s.token_hash = $1 and s.expires_at > now() and s.last_seen_at > now() - make_interval(hours => $2) and u.active`,
    [sha256(token), IDLE_HOURS],
  );
  const row = r.rows[0];
  if (!row) return null;
  if (Date.now() - row.last_seen_at.getTime() > 60_000) {
    await query("update admin_sessions set last_seen_at = now() where id = $1", [row.session_id]);
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role, mustChangePassword: row.must_change_password, sessionId: row.session_id };
});

export async function endAdminSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(cookieName())?.value;
  if (token) await query("delete from admin_sessions where token_hash = $1", [sha256(token)]);
  jar.delete(cookieName());
}

export type LoginResult = { ok: true; admin: { id: string; mustChangePassword: boolean } } | { ok: false; error: string };

const GENERIC_FAIL = "That email and password don’t match. Check them and try again.";

export async function loginWithPassword(emailInput: string, password: string): Promise<LoginResult> {
  const email = normalizeEmail(emailInput);
  const ip = await clientIp();
  const [byIp, byEmail] = await Promise.all([rateLimit(`login:ip:${ip}`, 30, 600), rateLimit(`login:email:${email}`, 10, 900)]);
  if (!byIp.ok || !byEmail.ok) return { ok: false, error: "Too many attempts. Please wait a few minutes and try again." };

  const admin = await findAdminByEmail(email);
  const locked = !!admin?.locked_until && admin.locked_until > new Date();
  const valid = await verifyPassword(password, admin?.password_hash);
  if (!admin || !admin.active || locked || !valid) {
    if (admin && admin.active && !locked) {
      const failed = admin.failed_attempts + 1;
      await query("update admin_users set failed_attempts = $2::int, locked_until = case when $2::int >= $3::int then now() + make_interval(mins => $4::int) else locked_until end where id = $1", [admin.id, failed, MAX_FAILED, LOCK_MINUTES]);
    }
    await audit(null, "auth.login_failed", "admin_user", admin?.id ?? "", { email }, ip);
    return { ok: false, error: locked ? "This account is temporarily locked after too many attempts. Try again in a few minutes." : GENERIC_FAIL };
  }
  await query("update admin_users set failed_attempts = 0, locked_until = null, last_login_at = now() where id = $1", [admin.id]);
  await resetRateLimit(`login:email:${email}`);
  await startAdminSession(admin.id);
  await audit({ id: admin.id, label: admin.email }, "auth.login", "admin_user", admin.id, {}, ip);
  return { ok: true, admin: { id: admin.id, mustChangePassword: admin.must_change_password } };
}

/* ------------------------------------------------------------------ guards (always enforced on the server) */

/** For pages: sends visitors to the sign-in page, and signed-in people without permission to "forbidden". */
export async function requireAdmin(permission?: Permission, opts: { allowMustChange?: boolean } = {}): Promise<AdminSession> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  if (admin.mustChangePassword && !opts.allowMustChange) redirect("/admin/account?required=1");
  if (permission && !can(admin.role, permission)) redirect("/admin/forbidden");
  return admin;
}

/** For route handlers (downloads, uploads): returns an HTTP-style error instead of redirecting. */
export async function adminFor(permission: Permission): Promise<{ admin: AdminSession } | { error: 401 | 403 }> {
  const admin = await getAdmin();
  if (!admin) return { error: 401 };
  if (admin.mustChangePassword || !can(admin.role, permission)) return { error: 403 };
  return { admin };
}
