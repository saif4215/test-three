import "server-only";
import { cache } from "react";
import { z } from "zod";
import { query, tx } from "./db";
import { audit, type Actor } from "./audit";
import { getIntegrationStates, INTEGRATION_LABELS, type IntegrationKey } from "./integrations";
import { orderWindowMessages, type WindowState } from "./order-window";

/* ------------------------------------------------------------------ store settings */

export const fulfillmentMethodSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  type: z.enum(["pickup", "delivery", "other"]).default("pickup"),
  feeCents: z.number().int().min(0).max(100_000).default(0),
  instructions: z.string().trim().max(2000).default(""),
  enabled: z.boolean().default(true),
});
export type FulfillmentMethod = z.infer<typeof fulfillmentMethodSchema>;

const isoOrNull = z.string().datetime({ offset: true }).nullable().default(null);
export const orderWindowSchema = z.object({
  opensAt: isoOrNull,
  closesAt: isoOrNull,
  note: z.string().trim().max(300).default(""),
});

const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit colour such as #111111");

export const storeSettingsSchema = z.object({
  storeName: z.string().trim().min(1).max(80).default("ICSI"),
  /** Shown in the footer and in emails when it differs from the store name. */
  orgName: z.string().trim().min(1).max(120).default("ICSI"),
  /** Optional outside links. The store links to no other website unless these are filled in. */
  websiteUrl: z.string().trim().max(300).default(""),
  uniformsUrl: z.string().trim().max(300).default(""),
  logoAssetId: z.string().uuid().nullable().default(null),
  brandPrimary: colour.default("#111111"),
  brandAccent: colour.default("#e4501a"),
  timezone: z.string().trim().min(1).max(60).default("America/New_York"),
  maxQuantityPerLine: z.number().int().min(1).max(100).default(10),
  lowStockDefault: z.number().int().min(0).max(1000).default(5),
  trackingLinkDays: z.number().int().min(1).max(730).default(120),
  requirePhone: z.boolean().default(false),
  requireTermsAcceptance: z.boolean().default(true),
  checkoutInstructions: z.string().trim().max(3000).default(""),
  orderAlertEmails: z.array(z.string().trim().email().max(254)).max(5).default([]),
  fulfillmentMethods: z.array(fulfillmentMethodSchema).max(4).default([]),
  orderWindow: orderWindowSchema.default({ opensAt: null, closesAt: null, note: "" }),
  /** Whether checkout asks for the student's name and grade/class. Off until the owner decides to collect it. */
  studentInfo: z.enum(["off", "optional", "required"]).default("off"),
  /** If set (for example "icstatenisland.org"), only Google accounts on that domain may sign in as staff. */
  adminGoogleDomain: z.string().trim().toLowerCase().max(100).default(""),
});
export type StoreSettings = z.infer<typeof storeSettingsSchema>;
export const DEFAULT_STORE_SETTINGS: StoreSettings = storeSettingsSchema.parse({});

export async function loadStoreSettings(): Promise<StoreSettings> {
  const r = await query<{ value: unknown }>("select value from settings where key = 'store'");
  if (!r.rowCount) return DEFAULT_STORE_SETTINGS;
  const parsed = storeSettingsSchema.safeParse(r.rows[0].value);
  if (parsed.success) return parsed.data;
  console.error("[settings] stored settings are invalid; using defaults for the invalid parts", parsed.error.issues[0]);
  // Keep every valid field, reset only the broken ones.
  const stored = (r.rows[0].value ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = {};
  for (const [k, schema] of Object.entries(storeSettingsSchema.shape)) {
    const one = (schema as z.ZodTypeAny).safeParse(stored[k]);
    if (one.success) merged[k] = one.data;
  }
  return storeSettingsSchema.parse(merged);
}

/** Per-request memoised read for server components. */
export const getStoreSettings = cache(loadStoreSettings);

export async function saveStoreSettings(next: StoreSettings, actor: Actor, ip: string | null = null): Promise<void> {
  const value = storeSettingsSchema.parse(next);
  await query("insert into settings (key, value, updated_at) values ('store', $1, now()) on conflict (key) do update set value = excluded.value, updated_at = now()", [JSON.stringify(value)]);
  await audit(actor, "settings.update", "settings", "store", { fields: Object.keys(value) }, ip);
}

/* ------------------------------------------------------------------ feature switches */

interface FeatureDef {
  label: string;
  description: string;
  default: boolean;
  /** Stays off until this outside service is configured on the server AND verified. */
  requires?: IntegrationKey;
  /** Stays off unless this other feature is on and working. */
  dependsOn?: string;
  /** Changing it changes what customers can do with orders. */
  affectsOrders?: boolean;
}

export const FEATURES = {
  cart: { label: "Shopping bag", description: "Lets visitors collect items in a bag. Without it the store is browse-only.", default: true, affectsOrders: true },
  order_requests: { label: "Order requests", description: "Customers send an order request that you review and accept. No payment is taken online.", default: false, affectsOrders: true },
  online_payments: { label: "Online card payments (Stripe)", description: "Customers pay by card on a secure Stripe page. Requires Stripe keys to be configured and verified.", default: false, requires: "stripe", affectsOrders: true },
  wishlist: { label: "Favourites", description: "Visitors can save favourite products in their browser.", default: true },
  restock_alerts: { label: "Back-in-stock alerts", description: "Customers can ask to be emailed when a size or colour returns. Needs working email.", default: false, dependsOn: "email_notifications" },
  promotions: { label: "Discount codes", description: "Customers can apply promotion codes that you create under Promotions.", default: false, affectsOrders: true },
  collections: { label: "Limited-edition collections", description: "Show collections on the storefront.", default: true },
  order_tracking: { label: "Order tracking", description: "Customers can check the status of their order with a private tracking link.", default: true },
  analytics: { label: "Analytics", description: "Sales and inventory analytics for administrators.", default: true },
  email_notifications: { label: "Email notifications", description: "Order confirmations, status updates and other messages. Requires email (SMTP) to be configured and verified.", default: false, requires: "email" },
  ai_assistant: { label: "AI writing assistant", description: "Drafting help for titles, descriptions and announcements. Requires an Anthropic API key to be configured and verified.", default: false, requires: "anthropic" },
  customer_sign_in: { label: "Customer sign-in with Google", description: "Shoppers can sign in with Google to see their past orders and speed up checkout. Checking out as a guest always still works.", default: false, requires: "google" },
  admin_google_sign_in: { label: "Staff sign-in with Google", description: "Team members can sign in with the Google account whose email is on the Team page. Nobody can sign up this way.", default: false, requires: "google" },
} as const satisfies Record<string, FeatureDef>;

export type FeatureKey = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];
export type Features = Record<FeatureKey, boolean>;
const def = (k: FeatureKey): FeatureDef => FEATURES[k];

/** What the owner switched on or off (before checking that outside services work). */
export async function loadStoredFeatureFlags(): Promise<Features> {
  const rows = (await query<{ key: string; enabled: boolean }>("select key, enabled from feature_flags")).rows;
  const stored = new Map(rows.map((r) => [r.key, r.enabled]));
  const out = {} as Features;
  for (const k of FEATURE_KEYS) out[k] = stored.get(k) ?? def(k).default;
  return out;
}

/** What is actually on: switched on AND its outside service verified AND its dependencies working. */
export async function loadEffectiveFeatures(): Promise<Features> {
  const [stored, states] = await Promise.all([loadStoredFeatureFlags(), getIntegrationStates()]);
  const out = {} as Features;
  for (const k of FEATURE_KEYS) {
    const d = def(k);
    out[k] = stored[k] && (!d.requires || states[d.requires].verified);
  }
  for (const k of FEATURE_KEYS) {
    const dep = def(k).dependsOn as FeatureKey | undefined;
    if (dep && !out[dep]) out[k] = false;
  }
  return out;
}

export const getFeatures = cache(loadEffectiveFeatures);
export async function isFeatureOn(k: FeatureKey): Promise<boolean> {
  return (await loadEffectiveFeatures())[k];
}

export class FeatureError extends Error {}

/** Applies switch changes. Turning on something that needs an outside service (or another feature) is refused until it works. */
export async function setFeatureFlags(changes: Partial<Features>, actor: Actor, ip: string | null = null): Promise<{ on: FeatureKey[]; off: FeatureKey[] }> {
  const [current, states] = await Promise.all([loadStoredFeatureFlags(), getIntegrationStates()]);
  const next = { ...current, ...changes };
  const on: FeatureKey[] = [];
  const off: FeatureKey[] = [];
  for (const k of FEATURE_KEYS) {
    if (next[k] === current[k]) continue;
    if (next[k]) {
      const d = def(k);
      if (d.requires && !states[d.requires].verified) {
        const st = states[d.requires];
        throw new FeatureError(
          `“${d.label}” needs ${INTEGRATION_LABELS[d.requires]} to be configured and verified first. ${st.configured ? "Press Verify under Integrations." : `Missing on the server: ${st.missing.join(", ")}.`}`,
        );
      }
      const dep = d.dependsOn as FeatureKey | undefined;
      if (dep && !next[dep]) throw new FeatureError(`“${d.label}” needs “${FEATURES[dep].label}” to be on first.`);
      on.push(k);
    } else off.push(k);
  }
  // Switching something off also switches off what depends on it.
  for (const k of FEATURE_KEYS) {
    const dep = def(k).dependsOn as FeatureKey | undefined;
    if (dep && !next[dep] && next[k]) {
      next[k] = false;
      off.push(k);
    }
  }
  if (!on.length && !off.length) return { on, off };
  await tx(async (c) => {
    for (const k of [...on, ...off]) {
      await c.query("insert into feature_flags (key, enabled, updated_at) values ($1, $2, now()) on conflict (key) do update set enabled = excluded.enabled, updated_at = now()", [k, next[k]]);
    }
  });
  await audit(actor, "features.update", "features", "", { on, off }, ip);
  return { on, off };
}

/* ------------------------------------------------------------------ can customers order right now? */

export interface OrderingStatus {
  open: boolean;
  /** Which ways of ordering are available at all. */
  modes: Array<"request" | "online">;
  state: WindowState;
  banner: string | null;
  title: string | null;
  message: string | null;
}

export function orderingStatus(features: Features, settings: Pick<StoreSettings, "orderWindow" | "timezone">, now = new Date()): OrderingStatus {
  const modes: Array<"request" | "online"> = [];
  if (features.cart && features.order_requests) modes.push("request");
  if (features.cart && features.online_payments) modes.push("online");
  const w = orderWindowMessages(settings.orderWindow, settings.timezone, now);
  if (!features.cart) return { open: false, modes, state: w.state, banner: w.banner, title: "Ordering isn’t available", message: "This store is browse-only right now." };
  if (modes.length === 0) return { open: false, modes, state: w.state, banner: w.banner, title: "Ordering isn’t open yet", message: "Ordering hasn’t been switched on yet. Please check back soon." };
  const inWindow = w.state === "none" || w.state === "open";
  return { open: inWindow, modes, state: w.state, banner: w.banner, title: inWindow ? null : w.title, message: inWindow ? null : w.message };
}
