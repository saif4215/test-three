import "server-only";

/**
 * Environment access in one place. Everything is read lazily (getters) so tests and scripts can set variables
 * after this module loads. Secrets are only ever read on the server and never sent to the browser.
 */
const str = (name: string, fallback = "") => (process.env[name] ?? fallback).trim();
const num = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && process.env[name] !== undefined && process.env[name] !== "" ? n : fallback;
};

export const env = {
  /**
   * The public address of the site. APP_URL wins; otherwise the address the host provides (Render sets
   * RENDER_EXTERNAL_URL on every web service), so a Render deploy needs no address typed in.
   */
  get appUrl() {
    return (str("APP_URL") || str("RENDER_EXTERNAL_URL") || "http://localhost:3000").replace(/\/+$/, "");
  },
  get secureCookies() {
    return this.appUrl.startsWith("https://");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  /** Signs tracking codes and OAuth state. Must be long and random; never reuse it elsewhere. */
  get appSecret() {
    const s = str("APP_SECRET");
    if (s.length < 32) throw new Error("APP_SECRET must be set to a random string of at least 32 characters.");
    return s;
  },
  get databaseUrl() {
    const u = str("DATABASE_URL");
    if (!u) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
    return u;
  },
  get databaseSsl() {
    return str("DATABASE_SSL") === "1";
  },
  /**
   * How many reverse proxies sit in front of the app and append to X-Forwarded-For (1 for most hosts; 0 if the app is
   * reached directly, in which case that header is ignored because anyone can forge it).
   */
  get trustedProxyHops() {
    const n = Number(str("TRUSTED_PROXY_HOPS", "1"));
    return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 1;
  },
  /** If set, /admin/setup can create the very first owner (a one-time page that closes itself once an admin exists). */
  get adminSetupToken() {
    return str("ADMIN_SETUP_TOKEN");
  },
  get storageDriver(): "local" | "s3" {
    return str("STORAGE_DRIVER", "local") === "s3" ? "s3" : "local";
  },
  get uploadDir() {
    return str("UPLOAD_DIR", "./uploads");
  },
  s3: {
    get bucket() { return str("S3_BUCKET"); },
    get region() { return str("S3_REGION", "auto"); },
    get endpoint() { return str("S3_ENDPOINT"); },
    get accessKeyId() { return str("S3_ACCESS_KEY_ID"); },
    get secretAccessKey() { return str("S3_SECRET_ACCESS_KEY"); },
  },
  smtp: {
    get host() { return str("SMTP_HOST"); },
    get port() { return num("SMTP_PORT", 587); },
    get user() { return str("SMTP_USER"); },
    get pass() { return str("SMTP_PASS"); },
    get secure() { return str("SMTP_SECURE") === "1"; },
    get from() { return str("EMAIL_FROM"); },
  },
  stripe: {
    get secretKey() { return str("STRIPE_SECRET_KEY"); },
    get webhookSecret() { return str("STRIPE_WEBHOOK_SECRET"); },
    /** Development/testing only: point the Stripe SDK at a local stand-in server. */
    get apiBase() { return str("STRIPE_API_BASE"); },
  },
  anthropic: {
    get apiKey() { return str("ANTHROPIC_API_KEY"); },
    get model() { return str("ANTHROPIC_MODEL", "claude-sonnet-5-5"); },
    get baseUrl() { return str("ANTHROPIC_BASE_URL"); },
  },
  google: {
    get clientId() { return str("GOOGLE_CLIENT_ID"); },
    get clientSecret() { return str("GOOGLE_CLIENT_SECRET"); },
    /** Development/testing only: point the sign-in flow at a local stand-in for Google. */
    get baseUrl() { return str("GOOGLE_OIDC_BASE_URL"); },
  },
};
