import { describe, expect, it } from "vitest";
import { cleanDbPerTest, customer, makeProduct, openShop, patchSettings, setFlags } from "./helpers";
import { placeOrder } from "../src/lib/orders/create";
import { getOrder } from "../src/lib/orders/queries";
import { query } from "../src/lib/db";

cleanDbPerTest();

async function abandonedOnlineOrder() {
  await openShop();
  await setFlags({ cart: true, online_payments: true });
  const { recordVerification } = await import("../src/lib/integrations");
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
  await recordVerification("stripe", true, "test");
  await patchSettings({ requireTermsAcceptance: false });
  const p = await makeProduct({ variants: [{ stock: 3 }] });
  const placed = await placeOrder({ mode: "online", items: [{ variantId: p.variants[0].id, quantity: 2 }], name: customer.name, email: customer.email });
  await query("update orders set created_at = now() - interval '3 hours' where id = $1", [placed.orderId]);
  return { p, placed };
}

describe("housekeeping that runs by itself", () => {
  it("runs once per interval, however many callers ask", async () => {
    const { runMaintenanceIfDue } = await import("../src/lib/maintenance");
    expect((await runMaintenanceIfDue()).ran).toBe(true);
    expect((await runMaintenanceIfDue()).ran).toBe(false);
    // Several servers asking at the same moment: exactly one wins.
    await query("update rate_limits set window_start = now() - interval '10 minutes' where key = 'maintenance'");
    const results = await Promise.all([runMaintenanceIfDue(), runMaintenanceIfDue(), runMaintenanceIfDue(), runMaintenanceIfDue()]);
    expect(results.filter((r) => r.ran)).toHaveLength(1);
  });

  it("cancels unpaid card orders and puts their stock back", async () => {
    const { runMaintenanceIfDue } = await import("../src/lib/maintenance");
    const { p, placed } = await abandonedOnlineOrder();
    const report = await runMaintenanceIfDue();
    expect(report.cancelledOrders).toBe(1);
    expect((await getOrder(placed.orderId))!.order.status).toBe("cancelled");
    expect((await query<{ stock: number }>("select stock from product_variants where id = $1", [p.variants[0].id])).rows[0].stock).toBe(3);
  });

  it("deletes expired sessions, old reset links and stale counters, and keeps what is still needed", async () => {
    const { runMaintenanceIfDue } = await import("../src/lib/maintenance");
    const { createAdminUser } = await import("../src/lib/admins");
    const admin = await createAdminUser({ email: "owner@example.org", password: "Maple-Quilt-Harbor-83", role: "owner" });
    await query("insert into admin_sessions (admin_id, token_hash, expires_at) values ($1, 'old', now() - interval '1 hour'), ($1, 'live', now() + interval '1 day')", [admin.id]);
    await query("insert into rate_limits (key, count, window_start) values ('login:ip:old', 3, now() - interval '3 days'), ('login:ip:fresh', 3, now())");
    await query("insert into email_outbox (to_email, subject, text_body, html_body, status, created_at) values ('a@example.org', 's', 't', 'h', 'sent', now() - interval '200 days'), ('b@example.org', 's', 't', 'h', 'failed', now() - interval '200 days'), ('c@example.org', 's', 't', 'h', 'sent', now())");
    const report = await runMaintenanceIfDue();
    expect(report.deletedSessions).toBe(1);
    expect((await query<{ token_hash: string }>("select token_hash from admin_sessions")).rows.map((r) => r.token_hash)).toEqual(["live"]);
    expect((await query<{ key: string }>("select key from rate_limits where key like 'login:%'")).rows.map((r) => r.key)).toEqual(["login:ip:fresh"]);
    expect(report.deletedEmails).toBe(1);
    expect((await query<{ to_email: string }>("select to_email from email_outbox order by to_email")).rows.map((r) => r.to_email)).toEqual(["b@example.org", "c@example.org"]);
  });
});
