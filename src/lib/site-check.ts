import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { query } from "./db";
import { env } from "./env";
import { getIntegrationStates, INTEGRATION_KEYS, INTEGRATION_LABELS, type IntegrationKey } from "./integrations";

/**
 * "Site check": plain-language answers to "is this set up properly?", so a non-technical owner never has to read server
 * logs. Each item says what was looked at, whether it is fine, and what to do if it is not. Nothing here changes anything.
 */
export type CheckLevel = "ok" | "warn" | "problem";

export interface CheckItem {
  id: string;
  level: CheckLevel;
  title: string;
  detail: string;
  /** What to do about it (only when the level is not "ok"). */
  fix?: string;
}

export interface ServiceLine {
  key: IntegrationKey;
  label: string;
  status: "verified" | "not-verified" | "not-set-up";
}

export interface SiteCheckResult {
  items: CheckItem[];
  services: ServiceLine[];
  worst: CheckLevel;
  needAttention: number;
}

/** The address the visitor actually used (from the request headers). Empty parts mean "unknown". */
export interface SeenAddress {
  host: string;
  proto: string;
}

const RANK: Record<CheckLevel, number> = { ok: 0, warn: 1, problem: 2 };
const isLocal = (host: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);

/** Compares the address the site believes it has (APP_URL) with the one it is being visited at. Pure. */
export function checkAddress(configured: string, seen: SeenAddress | null, production: boolean): CheckItem {
  const title = "Site address";
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return { id: "address", level: "problem", title, detail: `The site address is set to “${configured}”, which isn’t a valid web address.`, fix: "Set APP_URL to the full address starting with https://, for example https://your-site.onrender.com, then redeploy." };
  }
  const seenHost = (seen?.host ?? "").trim().toLowerCase();
  if (production && isLocal(url.host) && seenHost && !isLocal(seenHost)) {
    return { id: "address", level: "problem", title, detail: `The site thinks its address is ${url.origin} (this computer), but you are visiting it at ${seenHost}. Sign-in, payment and Google return links will go to the wrong place.`, fix: `Set APP_URL to https://${seenHost} (on Render: the service → Environment), then redeploy.` };
  }
  if (seenHost && !isLocal(seenHost) && url.host.toLowerCase() !== seenHost) {
    return { id: "address", level: "problem", title, detail: `The site thinks its address is ${url.host}, but you are visiting it at ${seenHost}. Sign-in cookies and payment or Google return links can break.`, fix: `Set APP_URL to https://${seenHost} (on Render: the service → Environment), or remove APP_URL so the host’s own address is used, then redeploy.` };
  }
  if (production && url.protocol === "http:" && seen?.proto === "https") {
    return { id: "address", level: "warn", title, detail: "The site is reached over https, but its configured address starts with http://. Sign-in cookies won’t be marked secure.", fix: "Set APP_URL to the https:// address and redeploy." };
  }
  return { id: "address", level: "ok", title, detail: `The site knows its own address: ${url.origin}.` };
}

const STORAGE_REASONS: Record<string, string> = {
  EACCES: "The server isn’t allowed to write there.",
  EPERM: "The server isn’t allowed to write there.",
  EROFS: "The storage is read-only.",
  ENOSPC: "The storage is full.",
  ENOENT: "The folder can’t be found or created.",
  ENOTDIR: "The folder can’t be created.",
};

const STORAGE_FIX = "On Render: open the service → Disks and check one is attached at /data/uploads, then redeploy. Or switch to S3-compatible storage (see the README).";

async function checkStorage(production: boolean): Promise<CheckItem> {
  const title = "Picture storage";
  if (env.storageDriver === "s3") {
    const missing = [["S3_BUCKET", env.s3.bucket], ["S3_ACCESS_KEY_ID", env.s3.accessKeyId], ["S3_SECRET_ACCESS_KEY", env.s3.secretAccessKey]].filter(([, v]) => !v).map(([n]) => n);
    if (missing.length) return { id: "storage", level: "problem", title, detail: `Pictures are set to go to an S3 bucket, but ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} missing.`, fix: "Add the missing settings (see the README), then redeploy." };
    return { id: "storage", level: "ok", title, detail: `Pictures go to the S3 bucket “${env.s3.bucket}”. (The connection itself isn’t tested here; try uploading a picture.)` };
  }
  const dir = path.resolve(env.uploadDir);
  try {
    await fs.mkdir(dir, { recursive: true });
    const probe = path.join(dir, `.site-check-${process.pid}-${Date.now()}`);
    await fs.writeFile(probe, "ok");
    await fs.rm(probe, { force: true });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code ?? "";
    return { id: "storage", level: "problem", title, detail: `Pictures can’t be saved to ${dir}. ${STORAGE_REASONS[code] ?? "Writing a test file failed."} Uploading product photos will fail.`, fix: STORAGE_FIX };
  }
  // A folder that lives on the server's own temporary storage is wiped on every restart or redeploy.
  try {
    const [here, root] = await Promise.all([fs.stat(dir), fs.stat("/")]);
    if (production && here.dev === root.dev) {
      return { id: "storage", level: "warn", title, detail: `Pictures are saved in ${dir}, which looks like the server’s temporary storage. They may be lost whenever the site restarts or is redeployed.`, fix: "Attach a persistent disk at that folder (on Render, the Blueprint does this), or switch to S3-compatible storage (see the README)." };
    }
  } catch {
    /* the comparison is only a hint; the write test above is what matters */
  }
  return { id: "storage", level: "ok", title, detail: `Pictures can be saved (${dir}).` };
}

async function checkHousekeeping(): Promise<CheckItem> {
  const title = "Automatic housekeeping";
  const r = await query<{ minutes: number }>("select (extract(epoch from now() - window_start) / 60)::float8 as minutes from rate_limits where key = 'maintenance'");
  const minutes = r.rows[0]?.minutes;
  if (minutes === undefined) {
    return { id: "housekeeping", level: "warn", title, detail: "It hasn’t run yet. It starts when your host’s health check visits /api/health, so give a new site a minute or two.", fix: "If it still hasn’t run later, set the host’s Health Check Path to /api/health (the Render Blueprint already does)." };
  }
  if (minutes > 20) {
    return { id: "housekeeping", level: "warn", title, detail: `It last ran about ${Math.round(minutes)} minutes ago. Unpaid card orders aren’t being cancelled and old sign-ins aren’t being cleared.`, fix: "Set your host’s Health Check Path to /api/health so it runs every few minutes." };
  }
  return { id: "housekeeping", level: "ok", title, detail: "It ran recently (cancels abandoned card orders, clears old sign-ins)." };
}

export async function runSiteCheck(seen: SeenAddress | null): Promise<SiteCheckResult> {
  const items: CheckItem[] = [];
  try {
    await query("select 1");
    items.push({ id: "database", level: "ok", title: "Database", detail: "The site can reach its database." });
  } catch {
    items.push({ id: "database", level: "problem", title: "Database", detail: "The site can’t reach its database.", fix: "Check DATABASE_URL, and that the database is running and in the same region." });
  }
  items.push(checkAddress(env.appUrl, seen, env.isProduction));
  items.push(await checkStorage(env.isProduction));
  try {
    items.push(await checkHousekeeping());
  } catch {
    items.push({ id: "housekeeping", level: "warn", title: "Automatic housekeeping", detail: "Couldn’t read when it last ran." });
  }

  let services: ServiceLine[] = [];
  try {
    const states = await getIntegrationStates();
    services = INTEGRATION_KEYS.map((k) => ({ key: k, label: INTEGRATION_LABELS[k], status: states[k].verified ? "verified" : states[k].configured ? "not-verified" : "not-set-up" }));
  } catch {
    /* the optional-services list is a bonus; the checks above are what matter */
  }

  items.sort((a, b) => RANK[b.level] - RANK[a.level]);
  const needAttention = items.filter((i) => i.level !== "ok").length;
  const worst = items.reduce<CheckLevel>((w, i) => (RANK[i.level] > RANK[w] ? i.level : w), "ok");
  return { items, services, worst, needAttention };
}

/** The Dashboard asks on every visit, so the answer is kept for 30 seconds. */
const cache = new Map<string, { at: number; result: SiteCheckResult }>();
export async function getSiteCheck(seen: SeenAddress | null): Promise<SiteCheckResult> {
  const key = `${seen?.host ?? ""}|${seen?.proto ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit.result;
  const result = await runSiteCheck(seen);
  cache.set(key, { at: Date.now(), result });
  return result;
}

/** Reads the visitor's address from the request headers (a host in front of the app sets the forwarded ones). */
export function seenFromHeaders(get: (name: string) => string | null): SeenAddress {
  const host = (get("x-forwarded-host") ?? get("host") ?? "").split(",")[0].trim();
  const proto = (get("x-forwarded-proto") ?? "").split(",")[0].trim();
  return { host, proto };
}
