import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import { countAdmins } from "@/lib/admins";
import { env } from "@/lib/env";
import { getFeatures } from "@/lib/settings";
import { safeNext } from "@/lib/safe-next";
import { Alert } from "@/components/ui";
import { GoogleButton } from "@/components/google-button";
import { LoginForm } from "./login-form";

const GOOGLE_ERRORS: Record<string, string> = {
  google_not_allowed: "That Google account isn’t on this store’s team. Ask an Owner to add your email under Team.",
  google_domain: "Use your organization’s Google account to sign in here.",
  google_cancelled: "Google sign-in was cancelled.",
  google_failed: "We couldn’t complete the Google sign-in. Please try again.",
  google_unreachable: "Google couldn’t be reached just now. Please try again in a moment.",
  google_busy: "Too many attempts. Please wait a few minutes and try again.",
  google_off: "Google sign-in isn’t switched on.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string; error?: string; next?: string }> }) {
  if (await getAdmin()) redirect("/admin");
  const sp = await searchParams;
  const features = await getFeatures();
  const none = (await countAdmins()) === 0;
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-muted">Store administration</p>
      {sp.reset ? <div className="mb-4"><Alert tone="ok">Your password was updated. Sign in with the new password.</Alert></div> : null}
      {none ? (
        <div className="mb-4">
          <Alert tone="warn" title="No administrator exists yet">
            {env.adminSetupToken ? (
              <>Create the first owner account on the <Link className="underline" href="/admin/setup">setup page</Link>.</>
            ) : (
              <>Create the first owner from the server: <code className="rounded bg-white px-1">npm run admin:create -- --email you@example.org --name &quot;Your Name&quot; --role owner</code></>
            )}
          </Alert>
        </div>
      ) : null}
      {sp.error && GOOGLE_ERRORS[sp.error] ? <div className="mb-4"><Alert tone="warn">{GOOGLE_ERRORS[sp.error]}</Alert></div> : null}
      <LoginForm next={safeNext(sp.next, "/admin", "/admin")} />
      {features.admin_google_sign_in ? (
        <div className="mt-5 space-y-2 border-t border-line pt-5">
          <GoogleButton href="/api/auth/google/start?type=admin" label="Sign in with Google" />
          <p className="text-center text-xs text-muted">Only team members already added by the Owner can use this.</p>
        </div>
      ) : null}
      <p className="mt-4 text-center text-sm"><Link href="/admin/forgot-password" className="underline underline-offset-4">Forgot your password?</Link></p>
    </>
  );
}
