import "server-only";
import { query } from "./db";
import { cancelAbandonedOnlineOrders } from "./orders/manage";
import { pruneRateLimits } from "./rate-limit";

/**
 * Housekeeping that would otherwise need a scheduler:
 *  - unpaid card orders are cancelled after two hours, so their stock goes back on sale,
 *  - expired sign-in sessions, used or expired password-reset links and old rate-limit counters are deleted,
 *  - email that was delivered long ago is dropped from the log (failures are kept so they stay visible).
 *
 * It runs from the health-check address, which hosting platforms call every few seconds, and at most once every five
 * minutes across all servers (the first caller claims the slot in the database). It never throws.
 */
export const MAINTENANCE_EVERY_SECONDS = 300;

async function claimSlot(): Promise<boolean> {
  const r = await query(
    `insert into rate_limits (key, count, window_start) values ('maintenance', 1, now())
     on conflict (key) do update set count = 1, window_start = now()
       where rate_limits.window_start < now() - make_interval(secs => $1)
     returning 1`,
    [MAINTENANCE_EVERY_SECONDS],
  );
  return r.rowCount === 1;
}

export interface MaintenanceReport {
  ran: boolean;
  cancelledOrders: number;
  deletedSessions: number;
  deletedResets: number;
  deletedEmails: number;
}

export async function runMaintenanceIfDue(): Promise<MaintenanceReport> {
  const report: MaintenanceReport = { ran: false, cancelledOrders: 0, deletedSessions: 0, deletedResets: 0, deletedEmails: 0 };
  try {
    if (!(await claimSlot())) return report;
    report.ran = true;
    report.cancelledOrders = await cancelAbandonedOnlineOrders(120);
    await pruneRateLimits();
    const staff = await query("delete from admin_sessions where expires_at < now()");
    const shoppers = await query("delete from customer_sessions where expires_at < now()");
    report.deletedSessions = (staff.rowCount ?? 0) + (shoppers.rowCount ?? 0);
    report.deletedResets = (await query("delete from password_resets where expires_at < now() - interval '1 day' or used_at < now() - interval '1 day'")).rowCount ?? 0;
    report.deletedEmails = (await query("delete from email_outbox where status = 'sent' and created_at < now() - interval '180 days'")).rowCount ?? 0;
  } catch (e) {
    console.error("[maintenance]", (e as Error).message);
  }
  return report;
}
