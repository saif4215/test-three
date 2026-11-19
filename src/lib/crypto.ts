import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const hmac = (data: string, key = env.appSecret) => crypto.createHmac("sha256", key).update(data).digest("base64url");

/** Constant-time string comparison (safe for secrets and tokens). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba); // keep the time roughly constant
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

// No 0/O or 1/I/L: order numbers get read out loud and typed from emails.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newOrderNumber(): string {
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `ICSI-${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Password hashing with scrypt (built in, memory-hard). Format: scrypt$N$r$p$salt$hash */
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 }, (e, k) => (e ? reject(e) : resolve(k))),
  );
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    await hashPassword(password); // equalise timing for unknown accounts
    return false;
  }
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(
      password,
      Buffer.from(salt, "base64url"),
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * Number(n) * Number(r) * 2 },
      (e, k) => (e ? reject(e) : resolve(k)),
    ),
  );
  return crypto.timingSafeEqual(expected, actual);
}
