import "server-only";
import { env } from "./env";
import { query } from "./db";
import { sha256 } from "./crypto";

/**
 * Outside services (email, card payments, Google sign-in, AI) are never assumed to work. A feature that needs one
 * stays OFF until (1) every required server variable is set and (2) an administrator pressed "Verify" and a real
 * test call succeeded. Changing the keys later invalidates the verification until it is run again.
 */
export type IntegrationKey = "email" | "stripe" | "anthropic" | "google";

export const INTEGRATION_KEYS: IntegrationKey[] = ["email", "stripe", "anthropic", "google"];

export const INTEGRATION_LABELS: Record<IntegrationKey, string> = {
  email: "Email (SMTP)",
  stripe: "Card payments (Stripe)",
  anthropic: "AI writing assistant (Anthropic)",
  google: "Sign in with Google",
};

/** What each service needs from the server environment. Values are never shown or stored in the database. */
function required(key: IntegrationKey): [string, string][] {
  switch (key) {
    case "email":
      return [["SMTP_HOST", env.smtp.host], ["EMAIL_FROM", env.smtp.from]];
    case "stripe":
      return [["STRIPE_SECRET_KEY", env.stripe.secretKey], ["STRIPE_WEBHOOK_SECRET", env.stripe.webhookSecret]];
    case "anthropic":
      return [["ANTHROPIC_API_KEY", env.anthropic.apiKey]];
    case "google":
      return [["GOOGLE_CLIENT_ID", env.google.clientId], ["GOOGLE_CLIENT_SECRET", env.google.clientSecret]];
  }
}

function allValues(key: IntegrationKey): string[] {
  switch (key) {
    case "email":
      return [env.smtp.host, String(env.smtp.port), env.smtp.user, env.smtp.pass, String(env.smtp.secure), env.smtp.from];
    case "stripe":
      return [env.stripe.secretKey, env.stripe.webhookSecret, env.stripe.apiBase];
    case "anthropic":
      return [env.anthropic.apiKey, env.anthropic.model, env.anthropic.baseUrl];
    case "google":
      return [env.google.clientId, env.google.clientSecret, env.google.baseUrl, env.appUrl];
  }
}

export const missingConfig = (key: IntegrationKey): string[] => required(key).filter(([, v]) => !v).map(([n]) => n);

/** A one-way digest of the configuration. If any key changes, the earlier verification no longer applies. */
export const configFingerprint = (key: IntegrationKey): string => sha256(`${key}\n${allValues(key).join("\n")}`);

export interface IntegrationState {
  key: IntegrationKey;
  label: string;
  configured: boolean;
  verified: boolean;
  verifiedAt: Date | null;
  detail: string | null;
  missing: string[];
}

export async function getIntegrationStates(): Promise<Record<IntegrationKey, IntegrationState>> {
  const rows = (await query<{ key: IntegrationKey; verified_at: Date | null; fingerprint: string | null; detail: string | null }>("select key, verified_at, fingerprint, detail from integration_status")).rows;
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out = {} as Record<IntegrationKey, IntegrationState>;
  for (const key of INTEGRATION_KEYS) {
    const missing = missingConfig(key);
    const rec = byKey.get(key);
    const verified = missing.length === 0 && !!rec?.verified_at && rec.fingerprint === configFingerprint(key);
    out[key] = {
      key,
      label: INTEGRATION_LABELS[key],
      configured: missing.length === 0,
      verified,
      verifiedAt: verified ? rec!.verified_at : null,
      detail: rec?.detail ?? null,
      missing,
    };
  }
  return out;
}

export async function recordVerification(key: IntegrationKey, ok: boolean, detail: string): Promise<void> {
  await query(
    `insert into integration_status (key, verified_at, fingerprint, detail) values ($1, $2, $3, $4)
     on conflict (key) do update set verified_at = excluded.verified_at, fingerprint = excluded.fingerprint, detail = excluded.detail`,
    [key, ok ? new Date() : null, ok ? configFingerprint(key) : null, detail.slice(0, 500)],
  );
}

/** Runs the real test for one service and remembers the outcome. Never throws: a failure is a result. */
export async function verifyIntegration(key: IntegrationKey): Promise<{ ok: boolean; detail: string }> {
  const missing = missingConfig(key);
  if (missing.length) {
    const detail = `Missing configuration: ${missing.join(", ")}`;
    await recordVerification(key, false, detail);
    return { ok: false, detail };
  }
  let result: { ok: boolean; detail: string };
  try {
    switch (key) {
      case "email":
        result = await (await import("./email")).verifySmtp();
        break;
      case "stripe":
        result = await (await import("./payments/stripe")).verifyStripe();
        break;
      case "anthropic":
        result = await (await import("./ai/anthropic")).verifyAnthropic();
        break;
      case "google":
        result = await (await import("./google/oidc")).verifyGoogle();
        break;
    }
  } catch (e) {
    result = { ok: false, detail: `The test failed: ${(e as Error).message}` };
  }
  await recordVerification(key, result.ok, result.detail);
  return result;
}
