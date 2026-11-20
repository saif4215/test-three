import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { FEATURES, FEATURE_KEYS, loadEffectiveFeatures, loadStoredFeatureFlags, loadStoreSettings, type FeatureKey } from "@/lib/settings";
import { getIntegrationStates, INTEGRATION_LABELS, type IntegrationKey } from "@/lib/integrations";
import { orderWindowMessages } from "@/lib/order-window";
import { toLocalInput, formatDateTime } from "@/lib/format";
import { getAsset } from "@/lib/media";
import { mediaUrl } from "@/lib/media-url";
import { AdminHeading, Section } from "@/components/admin-ui";
import { Badge } from "@/components/ui";
import { FeaturesForm, StoreSettingsForm, TestEmailButton, VerifyButton, type FeatureRow } from "@/components/settings-forms";

export const metadata = { title: "Settings" };

const HOW: Record<IntegrationKey, string> = {
  email: "Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE and EMAIL_FROM on the server (any provider with SMTP works: Postmark, SendGrid, Resend, Google Workspace…), restart, then press Verify. A test message can then be sent to you.",
  stripe: "Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. In Stripe, create a webhook pointing to /api/webhooks/stripe with the events checkout.session.completed, checkout.session.expired and checkout.session.async_payment_failed. Restart, then press Verify.",
  anthropic: "Set ANTHROPIC_API_KEY (and optionally ANTHROPIC_MODEL) on the server, restart, then press Verify.",
  google: "Create an OAuth client in Google Cloud (type: Web application) with the redirect URI shown below, set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server, restart, then press Verify. Then switch on customer and/or staff sign-in above.",
};

export default async function SettingsPage() {
  await requireAdmin("settings.manage");
  const [stored, effective, states, settings] = await Promise.all([loadStoredFeatureFlags(), loadEffectiveFeatures(), getIntegrationStates(), loadStoreSettings()]);
  const logo = await getAsset(settings.logoAssetId);
  const rows: FeatureRow[] = FEATURE_KEYS.map((k: FeatureKey) => {
    const def = FEATURES[k] as { label: string; description: string; requires?: IntegrationKey; dependsOn?: string; affectsOrders?: boolean };
    let blocked: string | null = null;
    if (def.requires && !states[def.requires].verified) blocked = `${INTEGRATION_LABELS[def.requires]} must be configured and verified (see Integrations below).`;
    else if (def.dependsOn && !effective[def.dependsOn as FeatureKey]) blocked = `“${FEATURES[def.dependsOn as FeatureKey].label}” must be on and working.`;
    return { key: k, label: def.label, description: def.description, stored: stored[k], effective: effective[k], blocked, affectsOrders: !!def.affectsOrders };
  });
  const win = settings.orderWindow;
  const wm = orderWindowMessages(win, settings.timezone);
  const windowStatus = win.opensAt || win.closesAt ? (wm.banner ?? "Within the window: ordering is open (when switched on).") : "No window set: orders are accepted whenever ordering is switched on.";
  const fulfillment = [0, 1, 2, 3].map((i) => settings.fulfillmentMethods[i] ?? null);
  return (
    <>
      <AdminHeading title="Settings">Owner-only. Feature switches take effect immediately on the live site; no redeploy is needed.</AdminHeading>
      <nav aria-label="Settings sections" className="sticky top-14 z-20 -mx-1 mb-6 flex flex-wrap gap-1.5 bg-soft/90 px-1 py-3 backdrop-blur no-print">
        {[["features", "Feature switches"], ["integrations", "Integrations"], ["store", "Store details"], ["ordering", "Ordering rules"], ["staff", "Staff sign-in"], ["pickup", "Pickup & delivery"]].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-medium transition hover:border-ink">{label}</a>
        ))}
      </nav>

      <Section title="Feature switches" id="features">
        <FeaturesForm rows={rows} />
        <p className="mt-3 text-xs text-muted">Shoppers can always check out as a guest. Customer accounts exist only if you switch on “Customer sign-in with Google”. Favourites live in each visitor’s browser either way.</p>
      </Section>

      <Section title="Integrations" id="integrations">
        <p className="mb-4 text-sm text-muted">Outside services stay unavailable until their keys are set on the server <em>and</em> a real test call succeeds. Keys are never shown here and never stored in the database.</p>
        <ul className="space-y-4">
          {(Object.keys(states) as IntegrationKey[]).map((k) => {
            const st = states[k];
            return (
              <li key={k} className="rounded-xl border border-line p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{INTEGRATION_LABELS[k]}</h3>
                  {st.verified ? <Badge tone="ok">Verified {st.verifiedAt ? formatDateTime(st.verifiedAt, settings.timezone) : ""}</Badge> : st.configured ? <Badge tone="warn">Configured, not verified</Badge> : <Badge>Not configured</Badge>}
                </div>
                {!st.configured ? <p className="text-sm text-warn">Missing on the server: {st.missing.join(", ")}</p> : null}
                {st.detail ? <p className="text-sm text-muted [overflow-wrap:anywhere]">{st.detail}</p> : null}
                <p className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{HOW[k]}</p>
                {k === "google" ? <p className="mt-1 text-xs text-muted">Authorised redirect URI: <code className="break-all rounded bg-soft px-1">{env.appUrl}/api/auth/google/callback</code></p> : null}
                {st.configured ? <div className="mt-3 flex flex-wrap gap-3"><VerifyButton service={k} label={st.verified ? "Verify again" : "Verify now"} />{k === "email" && st.verified ? <TestEmailButton /> : null}</div> : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-muted">Image storage: {env.storageDriver === "s3" ? "S3-compatible bucket" : `local disk (${env.uploadDir}). Use a persistent volume in production`}.</p>
      </Section>

      <StoreSettingsForm
        v={{
          storeName: settings.storeName, orgName: settings.orgName, websiteUrl: settings.websiteUrl, uniformsUrl: settings.uniformsUrl, logoAssetId: settings.logoAssetId, logoUrl: logo ? mediaUrl(logo, 200) : null,
          brandPrimary: settings.brandPrimary, brandAccent: settings.brandAccent, timezone: settings.timezone, maxQuantityPerLine: settings.maxQuantityPerLine, lowStockDefault: settings.lowStockDefault,
          trackingLinkDays: settings.trackingLinkDays, requirePhone: settings.requirePhone, requireTermsAcceptance: settings.requireTermsAcceptance, checkoutInstructions: settings.checkoutInstructions,
          orderAlertEmails: settings.orderAlertEmails.join(", "), fulfillment,
          windowOpensAt: toLocalInput(win.opensAt, settings.timezone), windowClosesAt: toLocalInput(win.closesAt, settings.timezone), windowNote: win.note, windowStatus,
          studentInfo: settings.studentInfo, adminGoogleDomain: settings.adminGoogleDomain,
        }}
      />
    </>
  );
}
