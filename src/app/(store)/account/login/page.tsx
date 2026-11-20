import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFeatures } from "@/lib/settings";
import { getCustomer } from "@/lib/customers";
import { safeNext } from "@/lib/safe-next";
import { Alert, PageHeading } from "@/components/ui";
import { GoogleButton } from "@/components/google-button";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const ERRORS: Record<string, string> = {
  google_cancelled: "Google sign-in was cancelled. You can try again, or keep shopping as a guest.",
  google_failed: "We couldn’t complete the Google sign-in. Please try again.",
  google_unreachable: "Google couldn’t be reached just now. Please try again in a moment.",
  google_busy: "Too many attempts. Please wait a few minutes and try again.",
  google_off: "Sign-in isn’t available right now. You can still check out as a guest.",
};

export default async function CustomerLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const features = await getFeatures();
  const sp = await searchParams;
  const next = safeNext(sp.next, "/", "/account");
  if (features.customer_sign_in && (await getCustomer())) redirect(next);
  return (
    <div className="container-page max-w-lg py-12 sm:py-16">
      <PageHeading title="Sign in">See your past orders and fill in your details faster at checkout.</PageHeading>
      {sp.error && ERRORS[sp.error] ? (
        <div className="mb-6">
          <Alert tone="warn">{ERRORS[sp.error]}</Alert>
        </div>
      ) : null}
      {features.customer_sign_in ? (
        <div className="space-y-4 rounded-2xl border border-line p-6 sm:p-8">
          <GoogleButton href={`/api/auth/google/start?type=customer&next=${encodeURIComponent(next)}`} />
          <p className="text-sm text-muted">We only receive your name and verified email address from Google. We never see your Google password. You never need an account to order: checking out as a guest always works.</p>
        </div>
      ) : (
        <Alert tone="info">Accounts aren’t switched on for this store. You can check out as a guest, and track any order with the private link in your confirmation.</Alert>
      )}
    </div>
  );
}
