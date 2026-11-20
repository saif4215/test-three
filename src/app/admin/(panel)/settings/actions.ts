"use server";

import { revalidatePath } from "next/cache";
import { adminAction, fd, fdBool, fdInt, UserError, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { FEATURE_KEYS, FeatureError, loadStoreSettings, saveStoreSettings, setFeatureFlags, storeSettingsSchema, type FeatureKey, type Features } from "@/lib/settings";
import { INTEGRATION_KEYS, INTEGRATION_LABELS, verifyIntegration, type IntegrationKey } from "@/lib/integrations";
import { fromLocalInput } from "@/lib/format";
import { slugify, safeUrl } from "@/lib/util";
import { sendEmail } from "@/lib/email";
import { testEmail } from "@/lib/email-templates";

export async function saveFeaturesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("settings.manage", async (admin, ip) => {
    const changes: Partial<Features> = {};
    for (const k of FEATURE_KEYS) changes[k] = form.get(`f.${k}`) === "on";
    try {
      const { on, off } = await setFeatureFlags(changes, { id: admin.id, label: admin.email }, ip);
      return on.length || off.length ? "Feature switches saved. They are live now." : "No changes.";
    } catch (e) {
      if (e instanceof FeatureError) throw new UserError(e.message);
      throw e;
    }
  });
  revalidatePath("/", "layout");
  return res;
}

export async function verifyIntegrationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("settings.manage", async (admin, ip) => {
    const key = fd(form, "service") as IntegrationKey;
    if (!INTEGRATION_KEYS.includes(key)) throw new UserError("Unknown service.");
    const r = await verifyIntegration(key);
    await audit({ id: admin.id, label: admin.email }, "integration.verify", "integration", key, { service: INTEGRATION_LABELS[key], ok: r.ok }, ip);
    if (!r.ok) throw new UserError(r.detail);
    return r.detail;
  });
  revalidatePath("/admin/settings");
  return res;
}

export async function testEmailAction(): Promise<ActionState> {
  const res = await adminAction("settings.manage", async (admin, ip) => {
    const mail = await testEmail();
    const r = await sendEmail({ to: admin.email, ...mail, template: "test" });
    if (r.skipped) throw new UserError("Email isn’t switched on yet. Verify it and turn on “Email notifications” first.");
    if (!r.sent) throw new UserError(`The test email failed: ${r.error ?? "unknown error"}`);
    await audit({ id: admin.id, label: admin.email }, "email.test", "email", "", {}, ip);
    return `A test message was sent to ${admin.email}. Check that inbox.`;
  });
  revalidatePath("/admin/emails");
  return res;
}

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function saveSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("settings.manage", async (admin, ip) => {
    const cur = await loadStoreSettings();
    const g = (k: string) => fd(form, k);
    const timezone = g("timezone") || cur.timezone;
    if (!validTimezone(timezone)) throw new UserError("That time zone isn’t recognised. Use a name such as America/New_York.");
    for (const [k, label] of [["websiteUrl", "Main website"], ["uniformsUrl", "Uniform page"]] as const) {
      if (g(k) && !safeUrl(g(k))) throw new UserError(`${label}: enter a full address starting with https://`);
    }
    const opens = fromLocalInput(g("windowOpensAt"), timezone);
    const closes = fromLocalInput(g("windowClosesAt"), timezone);
    if (opens && closes && closes <= opens) throw new UserError("“Orders close” must be after “Orders open”.");
    const used = new Set<string>();
    const fulfillment = [0, 1, 2, 3].flatMap((i) => {
      const label = g(`ful${i}.label`);
      if (!label) return [];
      let id = g(`ful${i}.id`) || slugify(label) || `option-${i + 1}`;
      while (used.has(id)) id = `${id}-${i + 1}`;
      used.add(id);
      const fee = g(`ful${i}.fee`);
      const cents = fee ? Math.round(Number(fee.replace(/^\$/, "")) * 100) : 0;
      if (!Number.isFinite(cents) || cents < 0) throw new UserError(`Option ${i + 1}: enter the fee in dollars, such as 5 or 0.`);
      return [{ id, label, type: (["pickup", "delivery", "other"].includes(g(`ful${i}.type`)) ? g(`ful${i}.type`) : "pickup") as "pickup" | "delivery" | "other", feeCents: cents, instructions: String(form.get(`ful${i}.instructions`) ?? "").trim(), enabled: fdBool(form, `ful${i}.enabled`) }];
    });
    const parsed = storeSettingsSchema.safeParse({
      storeName: g("storeName"),
      orgName: g("orgName"),
      websiteUrl: g("websiteUrl"),
      uniformsUrl: g("uniformsUrl"),
      logoAssetId: g("logoAssetId") || null,
      brandPrimary: g("brandPrimary"),
      brandAccent: g("brandAccent"),
      timezone,
      maxQuantityPerLine: fdInt(form, "maxQuantityPerLine", cur.maxQuantityPerLine),
      lowStockDefault: fdInt(form, "lowStockDefault", cur.lowStockDefault),
      trackingLinkDays: fdInt(form, "trackingLinkDays", cur.trackingLinkDays),
      requirePhone: fdBool(form, "requirePhone"),
      requireTermsAcceptance: fdBool(form, "requireTermsAcceptance"),
      checkoutInstructions: String(form.get("checkoutInstructions") ?? "").trim(),
      orderAlertEmails: g("orderAlertEmails").split(/[,\n;]/).map((s) => s.trim()).filter(Boolean),
      fulfillmentMethods: fulfillment,
      orderWindow: { opensAt: opens ? opens.toISOString() : null, closesAt: closes ? closes.toISOString() : null, note: g("windowNote") },
      studentInfo: g("studentInfo"),
      adminGoogleDomain: g("adminGoogleDomain").replace(/^@/, ""),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new UserError(issue.message && !/^(Required|Invalid)/.test(issue.message) ? issue.message : `Please check the “${issue.path.join(" › ")}” setting.`);
    }
    await saveStoreSettings(parsed.data, { id: admin.id, label: admin.email }, ip);
    return "Settings saved.";
  });
  revalidatePath("/", "layout");
  return res;
}

export type { FeatureKey };
