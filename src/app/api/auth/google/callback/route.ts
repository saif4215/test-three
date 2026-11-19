import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { query } from "@/lib/db";
import { audit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isFeatureOn, loadStoreSettings } from "@/lib/settings";
import { safeNext } from "@/lib/safe-next";
import { findAdminByEmail } from "@/lib/admins";
import { startAdminSession } from "@/lib/auth";
import { startCustomerSession, upsertCustomer } from "@/lib/customers";
import { completeSignIn, GoogleError, inDomain, oauthCookieName, readHandoff } from "@/lib/google/oidc";

export const dynamic = "force-dynamic";

/** Step 2: Google sends the person back here. Verify everything, then sign them in as a customer or (if allow-listed) as staff. */
export async function GET(req: NextRequest) {
  const jar = req.cookies.get(oauthCookieName())?.value;
  const handoff = readHandoff(jar);
  const kind = handoff?.kind ?? "customer";
  const done = (path: string) => {
    const res = NextResponse.redirect(new URL(path, env.appUrl), 303);
    res.cookies.delete(oauthCookieName()); // single use
    res.headers.set("cache-control", "no-store");
    return res;
  };
  const fail = (code: string) => done(kind === "admin" ? `/admin/login?error=${code}` : `/account/login?error=${code}`);
  const ip = await clientIp();

  if (!handoff) return fail("google_failed");
  if (!(await rateLimit(`google:cb:${ip}`, 30, 600)).ok) return fail("google_busy");
  if (!(await isFeatureOn(handoff.kind === "admin" ? "admin_google_sign_in" : "customer_sign_in"))) return fail("google_off");

  const sp = req.nextUrl.searchParams;
  let profile;
  try {
    profile = await completeSignIn(handoff, { code: sp.get("code"), state: sp.get("state"), error: sp.get("error") });
  } catch (e) {
    if (e instanceof GoogleError) {
      if (e.code !== "google_cancelled") console.warn("[google callback]", e.message);
      return fail(e.code === "google_unreachable" ? "google_unreachable" : e.code === "google_cancelled" ? "google_cancelled" : "google_failed");
    }
    console.error("[google callback]", e);
    return fail("google_failed");
  }

  if (handoff.kind === "admin") {
    const settings = await loadStoreSettings();
    // Staff sign-in is an allow-list: a Google account must match an ACTIVE team member. Nobody can sign up this way.
    const admin = await findAdminByEmail(profile.email);
    if (!admin || !admin.active) {
      await audit(null, "auth.login_failed", "admin_user", admin?.id ?? "", { email: profile.email, method: "google" }, ip);
      return fail("google_not_allowed");
    }
    if (settings.adminGoogleDomain && !inDomain(profile, settings.adminGoogleDomain)) {
      await audit(null, "auth.login_failed", "admin_user", admin.id, { email: profile.email, method: "google", reason: "domain" }, ip);
      return fail("google_domain");
    }
    await query("update admin_users set last_login_at = now(), failed_attempts = 0, locked_until = null where id = $1", [admin.id]);
    await startAdminSession(admin.id);
    await audit({ id: admin.id, label: admin.email }, "auth.login_google", "admin_user", admin.id, {}, ip);
    const res = done(admin.must_change_password ? "/admin/account?required=1" : safeNext(handoff.next, "/admin", "/admin"));
    return res;
  }

  const customer = await upsertCustomer({ sub: profile.sub, email: profile.email, name: profile.name });
  await startCustomerSession(customer.id);
  return done(safeNext(handoff.next, "/", "/account"));
}
