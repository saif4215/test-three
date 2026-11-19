import "server-only";
import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../env";
import { hmac, randomToken, safeEqual } from "../crypto";

/**
 * "Sign in with Google" using OpenID Connect, the authorization-code flow with PKCE.
 *
 * - The browser only ever follows plain links; no Google script runs on our pages.
 * - A signed, short-lived, HttpOnly cookie carries state + nonce + PKCE verifier from "start" to "callback".
 * - The ID token's signature is checked against Google's published keys, together with issuer, audience, expiry and nonce.
 * - Only addresses that Google itself reports as verified are accepted.
 */

const DEFAULT_BASE = "https://accounts.google.com";
const base = () => (env.google.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
const redirectUri = () => `${env.appUrl}/api/auth/google/callback`;

export type SignInKind = "customer" | "admin";

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

let discoveryCache: { at: number; key: string; doc: Discovery } | null = null;

export class GoogleError extends Error {
  constructor(
    public code: "google_unreachable" | "google_failed" | "google_cancelled" | "google_domain" | "google_not_allowed",
    message: string,
  ) {
    super(message);
  }
}

async function getJson(url: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000), cache: "no-store" });
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      /* a non-JSON reply is handled by the caller through the status */
    }
    return { status: res.status, body };
  } catch (e) {
    throw new GoogleError("google_unreachable", `Google couldn’t be reached: ${(e as Error).message}`);
  }
}

async function discovery(): Promise<Discovery> {
  const key = base();
  if (discoveryCache && discoveryCache.key === key && Date.now() - discoveryCache.at < 3_600_000) return discoveryCache.doc;
  const { status, body } = await getJson(`${key}/.well-known/openid-configuration`);
  const d = body as Partial<Discovery>;
  if (status !== 200 || !d.issuer || !d.authorization_endpoint || !d.token_endpoint || !d.jwks_uri) {
    throw new GoogleError("google_failed", "Google’s sign-in configuration couldn’t be read.");
  }
  discoveryCache = { at: Date.now(), key, doc: { issuer: d.issuer, authorization_endpoint: d.authorization_endpoint, token_endpoint: d.token_endpoint, jwks_uri: d.jwks_uri } };
  return discoveryCache.doc;
}

let jwks: { uri: string; set: ReturnType<typeof createRemoteJWKSet> } | null = null;
function keySet(uri: string) {
  if (!jwks || jwks.uri !== uri) jwks = { uri, set: createRemoteJWKSet(new URL(uri), { timeoutDuration: 10_000, cooldownDuration: 30_000 }) };
  return jwks.set;
}

/* ------------------------------------------------------------------ the signed hand-off cookie */

export const oauthCookieName = () => (env.secureCookies ? "__Host-icsi_oauth" : "icsi_oauth");
export const OAUTH_COOKIE_SECONDS = 600;

interface Handoff {
  state: string;
  nonce: string;
  verifier: string;
  kind: SignInKind;
  next: string;
  exp: number;
}

const sign = (h: Handoff): string => {
  const payload = Buffer.from(JSON.stringify(h)).toString("base64url");
  return `${payload}.${hmac(`oauth:${payload}`)}`;
};

export function readHandoff(value: string | undefined): Handoff | null {
  if (!value) return null;
  const [payload, mac] = value.split(".");
  if (!payload || !mac || !safeEqual(mac, hmac(`oauth:${payload}`))) return null;
  try {
    const h = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Handoff;
    if (typeof h.exp !== "number" || h.exp < Date.now() || !h.state || !h.nonce || !h.verifier || (h.kind !== "customer" && h.kind !== "admin")) return null;
    return h;
  } catch {
    return null;
  }
}

/** Builds the address to send the browser to, plus the cookie value that must come back on the callback. */
export async function beginSignIn(kind: SignInKind, next: string): Promise<{ url: string; cookie: string }> {
  const d = await discovery();
  const verifier = randomToken(48);
  const state = randomToken(24);
  const nonce = randomToken(24);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(d.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), cookie: sign({ state, nonce, verifier, kind, next, exp: Date.now() + OAUTH_COOKIE_SECONDS * 1000 }) };
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  hostedDomain: string | null;
}

/** Exchanges the code for tokens and returns the verified person. Throws GoogleError for anything that isn't a clean, verified sign-in. */
export async function completeSignIn(handoff: Handoff, params: { code: string | null; state: string | null; error: string | null }): Promise<GoogleProfile> {
  if (params.error) throw new GoogleError(params.error === "access_denied" ? "google_cancelled" : "google_failed", `Google reported: ${params.error}`);
  if (!params.code || !params.state || !safeEqual(params.state, handoff.state)) throw new GoogleError("google_failed", "The sign-in could not be matched to this browser.");

  const d = await discovery();
  const token = await getJson(d.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: redirectUri(),
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      code_verifier: handoff.verifier,
    }).toString(),
  });
  const idToken = token.body.id_token;
  if (token.status !== 200 || typeof idToken !== "string") throw new GoogleError("google_failed", "Google did not accept the sign-in.");

  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, keySet(d.jwks_uri), {
      // Google has used both spellings of its issuer.
      issuer: d.issuer === DEFAULT_BASE ? [DEFAULT_BASE, "accounts.google.com"] : d.issuer,
      audience: env.google.clientId,
      algorithms: ["RS256"],
      clockTolerance: 30,
    }));
  } catch (e) {
    throw new GoogleError("google_failed", `The ID token was not valid: ${(e as Error).message}`);
  }
  if (typeof payload.nonce !== "string" || !safeEqual(payload.nonce, handoff.nonce)) throw new GoogleError("google_failed", "The sign-in nonce did not match.");
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const verified = payload.email_verified === true || payload.email_verified === "true";
  if (!payload.sub || !email || !verified) throw new GoogleError("google_failed", "Google did not confirm an email address for this account.");
  return {
    sub: String(payload.sub),
    email,
    name: typeof payload.name === "string" ? payload.name : "",
    hostedDomain: typeof payload.hd === "string" ? payload.hd.toLowerCase() : null,
  };
}

/** True when the signed-in Google account belongs to the given Workspace domain (both the `hd` claim and the address must agree). */
export const inDomain = (p: GoogleProfile, domain: string): boolean => {
  const d = domain.replace(/^@/, "").toLowerCase();
  return p.hostedDomain === d && p.email.endsWith(`@${d}`);
};

/**
 * A real check of the Google configuration without a person signing in:
 *  1. read Google's sign-in configuration,
 *  2. ask the token endpoint to exchange a made-up code with OUR client id and secret.
 * Google answers "invalid_grant" when it recognises the client, and "invalid_client" when the id or secret is wrong.
 */
export async function verifyGoogle(): Promise<{ ok: boolean; detail: string }> {
  try {
    if (!env.google.baseUrl && !/\.apps\.googleusercontent\.com$/.test(env.google.clientId)) {
      return { ok: false, detail: "GOOGLE_CLIENT_ID doesn’t look right: it should end in .apps.googleusercontent.com." };
    }
    const d = await discovery();
    const res = await getJson(d.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "verification-probe",
        redirect_uri: redirectUri(),
        client_id: env.google.clientId,
        client_secret: env.google.clientSecret,
        code_verifier: randomToken(48),
      }).toString(),
    });
    const err = String(res.body.error ?? "");
    if (err === "invalid_client") return { ok: false, detail: "Google doesn’t recognise this client id and secret. Copy them again from the Google Cloud console (Credentials → OAuth client)." };
    if (err === "invalid_grant") return { ok: true, detail: `Google accepted the client id and secret. Make sure ${redirectUri()} is listed as an authorised redirect URI in the Google Cloud console.` };
    return { ok: false, detail: `Google replied unexpectedly (${res.status}${err ? `: ${err}` : ""}). Check the OAuth client settings and try again.` };
  } catch (e) {
    if (e instanceof GoogleError) return { ok: false, detail: e.message };
    return { ok: false, detail: `The test failed: ${(e as Error).message}` };
  }
}
