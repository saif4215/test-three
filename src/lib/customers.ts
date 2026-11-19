import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { env } from "./env";
import { query } from "./db";
import { randomToken, sha256 } from "./crypto";

/**
 * Customer accounts (sign in with Google). Completely separate from staff accounts: different tables, a different cookie,
 * and a customer session can never open the admin. Guest checkout always works without any of this.
 */
export const customerCookieName = () => (env.secureCookies ? "__Host-icsi_customer" : "icsi_customer");
const SESSION_DAYS = 30;

export interface Customer {
  id: string;
  email: string;
  name: string;
}

export async function upsertCustomer(profile: { sub: string; email: string; name: string }): Promise<Customer> {
  const r = await query<Customer>(
    `insert into customers (google_sub, email, name, last_login_at) values ($1, $2, $3, now())
     on conflict (google_sub) do update set email = excluded.email, name = case when customers.name = '' then excluded.name else customers.name end, last_login_at = now()
     returning id, email, name`,
    [profile.sub, profile.email.toLowerCase(), profile.name.slice(0, 120)],
  );
  return r.rows[0];
}

export async function startCustomerSession(customerId: string): Promise<void> {
  const token = randomToken(32);
  await query("insert into customer_sessions (customer_id, token_hash, expires_at) values ($1, $2, now() + make_interval(days => $3))", [customerId, sha256(token), SESSION_DAYS]);
  (await cookies()).set(customerCookieName(), token, { httpOnly: true, secure: env.secureCookies, sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400 });
}

export const getCustomer = cache(async (): Promise<Customer | null> => {
  const token = (await cookies()).get(customerCookieName())?.value;
  if (!token) return null;
  const r = await query<Customer>(
    `select c.id, c.email, c.name from customer_sessions s join customers c on c.id = s.customer_id where s.token_hash = $1 and s.expires_at > now()`,
    [sha256(token)],
  );
  return r.rows[0] ?? null;
});

export async function endCustomerSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(customerCookieName())?.value;
  if (token) await query("delete from customer_sessions where token_hash = $1", [sha256(token)]);
  jar.delete(customerCookieName());
}

/** Deletes the account and its sign-in sessions. Past orders stay (the shop needs them) but are no longer linked to the person. */
export async function deleteCustomer(id: string): Promise<void> {
  await query("delete from customers where id = $1", [id]);
}
