"use client";

import { saveFeaturesAction, saveSettingsAction, testEmailAction, verifyIntegrationAction } from "@/app/admin/(panel)/settings/actions";
import { ActionForm, ImagePicker, SubmitButton, Toggle } from "./admin-forms";

export interface FeatureRow {
  key: string;
  label: string;
  description: string;
  stored: boolean;
  effective: boolean;
  blocked: string | null;
  affectsOrders: boolean;
  /** Needs an outside service or another feature, whether or not that is ready yet. */
  hardRequires: boolean;
}

export function FeaturesForm({ rows }: { rows: FeatureRow[] }) {
  // Most stores only ever need the first group. The second needs an outside service (email, Stripe, Google, AI), so it stays folded away.
  const everyday = rows.filter((r) => !r.blocked && !r.hardRequires);
  const services = rows.filter((r) => r.blocked || r.hardRequires);
  const row = (r: FeatureRow) => (
    <li key={r.key} className="py-3.5">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" name={`f.${r.key}`} defaultChecked={r.stored} className="mt-1 size-5 shrink-0 accent-[var(--brand)]" />
        <span>
          <span className="font-medium">{r.label}</span>
          {r.stored && !r.effective ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">switched on but not working yet</span> : null}
          <span className="block text-sm text-muted">{r.description}</span>
          {r.blocked ? <span className="mt-1 block text-sm text-warn">Before you can turn this on: {r.blocked}</span> : null}
        </span>
      </label>
    </li>
  );
  return (
    <ActionForm action={saveFeaturesAction} className="space-y-3">
      <p className="text-sm text-muted">Most stores only need these. Tick what you want, then save.</p>
      <ul className="divide-y divide-line">{everyday.map(row)}</ul>
      {services.length > 0 ? (
        <details id="services" open={services.some((r) => r.stored)} className="group rounded-2xl border border-line px-5">
          <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-medium">
            <span>
              Connect other services <span className="font-normal text-muted">(optional: card payments, email, Google sign-in, writing assistant)</span>
            </span>
            <span aria-hidden="true" className="text-muted transition group-open:rotate-180">⌄</span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">{services.map(row)}</ul>
        </details>
      ) : null}
      <SubmitButton pendingLabel="Saving…">Save feature switches</SubmitButton>
    </ActionForm>
  );
}

export function VerifyButton({ service, label }: { service: string; label: string }) {
  return (
    <ActionForm action={verifyIntegrationAction} className="space-y-2">
      <input type="hidden" name="service" value={service} />
      <SubmitButton className="btn-secondary btn-sm" pendingLabel="Testing…">{label}</SubmitButton>
    </ActionForm>
  );
}

export function TestEmailButton() {
  return (
    <ActionForm action={testEmailAction} className="space-y-2">
      <SubmitButton className="btn-secondary btn-sm" pendingLabel="Sending…">Send me a test email</SubmitButton>
    </ActionForm>
  );
}

export interface StoreSettingsValues {
  storeName: string;
  orgName: string;
  websiteUrl: string;
  uniformsUrl: string;
  logoAssetId: string | null;
  logoUrl: string | null;
  brandPrimary: string;
  brandAccent: string;
  timezone: string;
  maxQuantityPerLine: number;
  lowStockDefault: number;
  trackingLinkDays: number;
  requirePhone: boolean;
  requireTermsAcceptance: boolean;
  checkoutInstructions: string;
  orderAlertEmails: string;
  fulfillment: ({ id: string; label: string; type: string; feeCents: number; instructions: string; enabled: boolean } | null)[];
  windowOpensAt: string;
  windowClosesAt: string;
  windowNote: string;
  windowStatus: string;
  studentInfo: "off" | "optional" | "required";
  adminGoogleDomain: string;
}

export function StoreSettingsForm({ v }: { v: StoreSettingsValues }) {
  const sec = "card mb-6 scroll-mt-24 space-y-4 p-6";
  return (
    <ActionForm action={saveSettingsAction} className="space-y-0">
      <section id="store" className={sec}>
        <h2 className="text-lg font-semibold">Store details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="storeName" className="label">Store name</label><input id="storeName" name="storeName" defaultValue={v.storeName} required maxLength={80} className="field" /><p className="hint">Shown in the header, emails and browser tab.</p></div>
          <div><label htmlFor="orgName" className="label">Organization name (shown in the footer)</label><input id="orgName" name="orgName" defaultValue={v.orgName} required maxLength={120} className="field" /></div>
          <div><label htmlFor="websiteUrl" className="label">Main website (optional)</label><input id="websiteUrl" name="websiteUrl" defaultValue={v.websiteUrl} maxLength={300} className="field" placeholder="https://" /><p className="hint">Leave empty and the store links to no other website.</p></div>
          <div><label htmlFor="uniformsUrl" className="label">Uniform page (optional)</label><input id="uniformsUrl" name="uniformsUrl" defaultValue={v.uniformsUrl} maxLength={300} className="field" placeholder="https://" /></div>
        </div>
        <ImagePicker name="logoAssetId" initialAssetId={v.logoAssetId} initialUrl={v.logoUrl} label="Logo" hint="Upload your approved logo file. Until you do, only the store name is shown: this site never invents a logo." kind="logo" />
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label htmlFor="brandPrimary" className="label">Main colour</label><div className="flex items-center gap-3"><input id="brandPrimary" name="brandPrimary" type="color" defaultValue={v.brandPrimary} className="h-12 w-16 cursor-pointer rounded-lg border border-line-strong bg-white p-1" /><span className="text-sm text-muted">Buttons and highlights</span></div></div>
          <div><label htmlFor="brandAccent" className="label">Accent colour</label><div className="flex items-center gap-3"><input id="brandAccent" name="brandAccent" type="color" defaultValue={v.brandAccent} className="h-12 w-16 cursor-pointer rounded-lg border border-line-strong bg-white p-1" /><span className="text-sm text-muted">“New” labels, promotions</span></div></div>
          <div><label htmlFor="timezone" className="label">Time zone</label><input id="timezone" name="timezone" defaultValue={v.timezone} maxLength={60} className="field" /><p className="hint">Used for schedules and dates shown.</p></div>
        </div>
        <p className="hint">The default colours are placeholders, not official colours. Enter your official colours here.</p>
      </section>

      <section id="ordering" className={sec}>
        <h2 className="text-lg font-semibold">Ordering rules</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label htmlFor="maxQuantityPerLine" className="label">Max of one item per order</label><input id="maxQuantityPerLine" name="maxQuantityPerLine" defaultValue={v.maxQuantityPerLine} inputMode="numeric" className="field" /></div>
          <div><label htmlFor="lowStockDefault" className="label">Default low-stock level</label><input id="lowStockDefault" name="lowStockDefault" defaultValue={v.lowStockDefault} inputMode="numeric" className="field" /></div>
          <div><label htmlFor="trackingLinkDays" className="label">Tracking links last (days)</label><input id="trackingLinkDays" name="trackingLinkDays" defaultValue={v.trackingLinkDays} inputMode="numeric" className="field" /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle name="requirePhone" label="Require a phone number" defaultChecked={v.requirePhone} />
          <Toggle name="requireTermsAcceptance" label="Customers must accept the terms at checkout" defaultChecked={v.requireTermsAcceptance} />
        </div>

        <fieldset className="rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold">Ordering window (optional)</legend>
          <p className="mb-3 text-sm text-muted">Limit when new orders can be placed, for example for a spirit-week drop. Leave both empty to accept orders whenever ordering is switched on. Orders already placed are never affected. Times use the store time zone ({v.timezone}).</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="windowOpensAt" className="label">Orders open</label><input id="windowOpensAt" name="windowOpensAt" type="datetime-local" defaultValue={v.windowOpensAt} className="field" /></div>
            <div><label htmlFor="windowClosesAt" className="label">Orders close</label><input id="windowClosesAt" name="windowClosesAt" type="datetime-local" defaultValue={v.windowClosesAt} className="field" /></div>
          </div>
          <div className="mt-4"><label htmlFor="windowNote" className="label">Note shown with the dates (optional)</label><input id="windowNote" name="windowNote" defaultValue={v.windowNote} maxLength={300} className="field" /></div>
          <p className="mt-3 text-sm"><strong>Right now:</strong> {v.windowStatus}</p>
        </fieldset>

        <div>
          <label htmlFor="studentInfo" className="label">Student information at checkout</label>
          <select id="studentInfo" name="studentInfo" defaultValue={v.studentInfo} className="field">
            <option value="off">Don’t ask</option>
            <option value="optional">Ask, but optional</option>
            <option value="required">Required</option>
          </select>
          <p className="hint">Checkout then asks for the student’s name and grade or class, so orders can be handed out by class. This is information about children: turn it on only if ICSI has agreed to collect it, and mention it in your Privacy policy.</p>
        </div>
        <div><label htmlFor="checkoutInstructions" className="label">Checkout instructions (optional)</label><textarea id="checkoutInstructions" name="checkoutInstructions" defaultValue={v.checkoutInstructions} maxLength={3000} className="field" /></div>
        <div><label htmlFor="orderAlertEmails" className="label">Email new orders to staff (optional)</label><input id="orderAlertEmails" name="orderAlertEmails" defaultValue={v.orderAlertEmails} className="field" placeholder="office@…, store@…" /><p className="hint">Needs email notifications to be on and working. Separate addresses with commas (up to 5).</p></div>
      </section>

      <section id="staff" className={sec}>
        <h2 className="text-lg font-semibold">Staff sign-in</h2>
        <div><label htmlFor="adminGoogleDomain" className="label">Staff Google sign-in: only allow this domain (optional)</label><input id="adminGoogleDomain" name="adminGoogleDomain" defaultValue={v.adminGoogleDomain} className="field" placeholder="example.org" /><p className="hint">If you use Google Workspace, enter your domain so only accounts on it can sign in with Google, even if someone else’s email is on the Team page. Leave empty to allow any Google account whose email is on the Team page.</p></div>
      </section>

      <section id="pickup" className={sec}>
        <h2 className="text-lg font-semibold">Pickup &amp; delivery</h2>
        <p className="text-sm text-muted">Add only the options that have been approved. Instructions are shown to customers at checkout, in their confirmation email, and when an order is ready. Nothing is pre-filled and no fees or schedules are assumed.</p>
        {v.fulfillment.map((m, i) => (
          <fieldset key={i} className="space-y-3 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold">Option {i + 1}</legend>
            <input type="hidden" name={`ful${i}.id`} value={m?.id ?? ""} />
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem]">
              <div><label htmlFor={`fl${i}`} className="label">Name</label><input id={`fl${i}`} name={`ful${i}.label`} defaultValue={m?.label ?? ""} maxLength={80} className="field" placeholder={i === 0 ? "e.g. Pickup" : ""} /></div>
              <div><label htmlFor={`ft${i}`} className="label">Type</label><select id={`ft${i}`} name={`ful${i}.type`} defaultValue={m?.type ?? "pickup"} className="field"><option value="pickup">Pickup</option><option value="delivery">Delivery</option><option value="other">Other</option></select></div>
              <div><label htmlFor={`ff${i}`} className="label">Fee (USD)</label><input id={`ff${i}`} name={`ful${i}.fee`} defaultValue={m && m.feeCents ? (m.feeCents / 100).toFixed(2) : ""} inputMode="decimal" className="field" placeholder="0.00" /></div>
            </div>
            <div><label htmlFor={`fi${i}`} className="label">Instructions</label><textarea id={`fi${i}`} name={`ful${i}.instructions`} defaultValue={m?.instructions ?? ""} maxLength={2000} className="field !min-h-20" placeholder="Where, when and how orders are collected or delivered (approved wording only)" /></div>
            <Toggle name={`ful${i}.enabled`} label="Offer this option to customers" defaultChecked={m?.enabled ?? true} />
          </fieldset>
        ))}
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-white/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
      </div>
    </ActionForm>
  );
}
