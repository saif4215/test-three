import "server-only";
import { headers } from "next/headers";
import { query } from "./db";

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

/** Best-effort client address for rate limiting and the activity log. */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim().slice(0, 64) || "unknown";
    return h.get("x-real-ip")?.slice(0, 64) || "unknown";
  } catch {
    return "unknown";
  }
}

/** Old counters are harmless but pile up; this is called now and then from busy paths. */
export async function pruneRateLimits(): Promise<void> {
  await query("delete from rate_limits where window_start < now() - interval '1 day'");
}
