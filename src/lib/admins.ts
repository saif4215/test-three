import "server-only";
import { query, tx, type Db } from "./db";
import { hashPassword } from "./crypto";
import { audit, type Actor } from "./audit";
import type { Role } from "./permissions";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  must_change_password: boolean;
  active: boolean;
  last_login_at: Date | null;
  created_at: Date;
}

const COLS = "id, email, name, role, must_change_password, active, last_login_at, created_at";

export class AdminError extends Error {}

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export async function countAdmins(): Promise<number> {
  return Number((await query<{ n: string }>("select count(*) as n from admin_users where active")).rows[0].n);
}

export async function findAdminByEmail(email: string) {
  const r = await query<AdminUser & { password_hash: string | null; failed_attempts: number; locked_until: Date | null }>(
    `select ${COLS}, password_hash, failed_attempts, locked_until from admin_users where lower(email) = $1`,
    [normalizeEmail(email)],
  );
  return r.rows[0] ?? null;
}

export async function listAdmins(): Promise<AdminUser[]> {
  return (await query<AdminUser>(`select ${COLS} from admin_users order by created_at`)).rows;
}

export async function createAdminUser(input: { email: string; name?: string; password: string | null; role: Role; mustChangePassword?: boolean; createdBy?: string | null }): Promise<AdminUser> {
  const email = normalizeEmail(input.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AdminError("Enter a valid email address.");
  if (await findAdminByEmail(email)) throw new AdminError("An administrator with that email already exists.");
  const hash = input.password ? await hashPassword(input.password) : null;
  const r = await query<AdminUser>(
    `insert into admin_users (email, name, password_hash, role, must_change_password, created_by)
     values ($1, $2, $3, $4, $5, $6) returning ${COLS}`,
    [email, (input.name ?? "").trim().slice(0, 120), hash, input.role, input.mustChangePassword ?? false, input.createdBy ?? null],
  );
  return r.rows[0];
}

/** Sets a new password and signs the person out everywhere (their old sessions can no longer be trusted). */
export async function setAdminPassword(id: string, password: string, mustChange: boolean): Promise<void> {
  const hash = await hashPassword(password);
  await tx(async (c) => {
    await c.query("update admin_users set password_hash = $2, must_change_password = $3, failed_attempts = 0, locked_until = null where id = $1", [id, hash, mustChange]);
    await c.query("delete from admin_sessions where admin_id = $1", [id]);
  });
}

async function activeOwners(c: Db, excluding?: string): Promise<number> {
  const r = await c.query<{ n: string }>("select count(*) as n from admin_users where active and role = 'owner' and ($1::uuid is null or id <> $1)", [excluding ?? null]);
  return Number(r.rows[0].n);
}

export async function changeAdminRole(id: string, role: Role, actor: Actor): Promise<void> {
  await tx(async (c) => {
    const cur = (await c.query<{ role: Role; email: string }>("select role, email from admin_users where id = $1 for update", [id])).rows[0];
    if (!cur) throw new AdminError("That person no longer exists.");
    if (cur.role === "owner" && role !== "owner" && (await activeOwners(c, id)) === 0) throw new AdminError("There must always be at least one Owner.");
    await c.query("update admin_users set role = $2 where id = $1", [id, role]);
    await audit(actor, "team.role", "admin_user", id, { email: cur.email, from: cur.role, to: role }, null, c);
  });
}

/** Revoking access ends every session of that person immediately. */
export async function setAdminActive(id: string, active: boolean, actor: Actor): Promise<void> {
  await tx(async (c) => {
    const cur = (await c.query<{ role: Role; email: string }>("select role, email from admin_users where id = $1 for update", [id])).rows[0];
    if (!cur) throw new AdminError("That person no longer exists.");
    if (!active && cur.role === "owner" && (await activeOwners(c, id)) === 0) throw new AdminError("The last Owner can’t be removed.");
    await c.query("update admin_users set active = $2 where id = $1", [id, active]);
    if (!active) await c.query("delete from admin_sessions where admin_id = $1", [id]);
    await audit(actor, active ? "team.restore" : "team.revoke", "admin_user", id, { email: cur.email }, null, c);
  });
}
