import "server-only";
import { headers } from "next/headers";
import { query } from "./db";
import { env } from "./env";

/** A fixed-window counter kept in PostgreSQL, so it holds across servers and restarts. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<{ ok: boolean; retryAfter: number }> {
  const r = await query<{ count: number; window_start: Date }>(
    `insert into rate_limits (key, count, window_start) values ($1, 1, now())
     on conflict (key) do update set
       count = case when rate_limits.window_start < now() - make_interval(secs => $2) then 1 else rate_limits.count + 1 end,
       window_start = case when rate_limits.window_start < now() - make_interval(secs => $2) then now() else rate_limits.window_start end
     returning count, window_start`,
    [key, windowSeconds],
  );
  const { count, window_start } = r.rows[0];
  const retryAfter = Math.max(1, Math.ceil(windowSeconds - (Date.now() - window_start.getTime()) / 1000));
  return { ok: count <= limit, retryAfter };
}

export async function resetRateLimit(key: string): Promise<void> {
  await query("delete from rate_limits where key = $1", [key]);
}

/**
 * Picks the visitor's address from the proxy headers. Each proxy appends the address it saw to X-Forwarded-For, so the
 * trustworthy entry is the one added by OUR proxy: `hops` places from the right. The left-most entry is whatever the
 * visitor chose to send, so it is never used for limits.
 */
export function pickClientIp(forwardedFor: string | null, realIp: string | null, hops: number): string {
  if (hops > 0 && forwardedFor) {
    const parts = forwardedFor.split(",").map((p) => p.trim()).filter(Boolean);
    const ip = parts[Math.max(0, parts.length - hops)];
    if (ip) return ip.slice(0, 64);
  }
  return (hops > 0 ? realIp : null)?.trim().slice(0, 64) || "unknown";
}

/** Best-effort client address for rate limiting and the activity log. */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return pickClientIp(h.get("x-forwarded-for"), h.get("x-real-ip"), env.trustedProxyHops);
  } catch {
    return "unknown";
  }
}

/** Old counters are harmless but pile up; this is called now and then from busy paths. */
export async function pruneRateLimits(): Promise<void> {
  await query("delete from rate_limits where window_start < now() - interval '1 day'");
}
