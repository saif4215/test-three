import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { isFeatureOn } from "@/lib/settings";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/safe-next";
import { beginSignIn, GoogleError, OAUTH_COOKIE_SECONDS, oauthCookieName, type SignInKind } from "@/lib/google/oidc";

export const dynamic = "force-dynamic";

/** Step 1: send the browser to Google. Nothing here trusts the query string beyond choosing which kind of sign-in. */
export async function GET(req: NextRequest) {
  const kind: SignInKind = req.nextUrl.searchParams.get("type") === "admin" ? "admin" : "customer";
  const back = (error: string) => NextResponse.redirect(new URL(kind === "admin" ? `/admin/login?error=${error}` : `/account/login?error=${error}`, env.appUrl), 303);

  if (!(await isFeatureOn(kind === "admin" ? "admin_google_sign_in" : "customer_sign_in"))) return back("google_off");
  if (!(await rateLimit(`google:start:${await clientIp()}`, 30, 600)).ok) return back("google_busy");

  const next = safeNext(req.nextUrl.searchParams.get("next"), kind === "admin" ? "/admin" : "/", kind === "admin" ? "/admin" : "/account");
  try {
    const { url, cookie } = await beginSignIn(kind, next);
    const res = NextResponse.redirect(url, 303);
    res.cookies.set(oauthCookieName(), cookie, { httpOnly: true, secure: env.secureCookies, sameSite: "lax", path: "/", maxAge: OAUTH_COOKIE_SECONDS });
    res.headers.set("cache-control", "no-store");
    return res;
  } catch (e) {
    if (e instanceof GoogleError) return back(e.code === "google_unreachable" ? "google_unreachable" : "google_failed");
    console.error("[google start]", e);
    return back("google_failed");
  }
}
