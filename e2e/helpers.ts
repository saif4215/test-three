import fs from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PASSWORD = process.env.E2E_PASSWORD ?? "E2e-Passw0rd!-2026";
const CONTROL = process.env.E2E_CONTROL ?? "http://127.0.0.1:4199";

export const accounts = {
  owner: "owner@example.org",
  manager: "manager@example.org",
  staff: "staff@example.org",
} as const;

/** Talks to the runner's control server (steering the stand-ins for Google, Stripe, mail and AI). */
export async function control<T = unknown>(request: APIRequestContext, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = method === "GET" ? await request.get(`${CONTROL}${path}`) : await request.post(`${CONTROL}${path}`, { data: body ?? {} });
  expect(res.ok(), `control ${path}`).toBeTruthy();
  return (await res.json()) as T;
}

export interface Mail {
  from: string;
  to: string[];
  subject: string;
  body: string;
}

export const mailbox = (request: APIRequestContext) => control<Mail[]>(request, "GET", "/mail");

const authDir = path.resolve(".data/e2e-auth");

/**
 * Signs in on the staff sign-in page. The signed-in session is remembered per account for the rest of the run (a real
 * person doesn't sign in again for every click, and the sign-in form is rate-limited on purpose), so later calls reuse it.
 * Pass `fresh: true` to go through the form again.
 */
export async function adminLogin(page: Page, email: string = accounts.owner, password = PASSWORD, opts: { fresh?: boolean } = {}) {
  const file = path.join(authDir, `${email}.json`);
  if (!opts.fresh && fs.existsSync(file)) {
    await page.context().addCookies(JSON.parse(fs.readFileSync(file, "utf8")).cookies);
    await page.goto("/admin");
    if (!new URL(page.url()).pathname.startsWith("/admin/login")) return;
    await page.context().clearCookies();
  }
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"));
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(await page.context().storageState()));
}

/** Collects console errors and failed requests during a test, so a page that "works" but logs errors still fails. */
export function watchProblems(page: Page, ignore: RegExp[] = []) {
  const problems: string[] = [];
  page.on("console", (m) => {
    // "Failed to load resource" lines carry no address; the response listener below reports the address.
    if (m.type() === "error" && !/Failed to load resource/.test(m.text()) && !ignore.some((r) => r.test(m.text()))) problems.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && !ignore.some((x) => x.test(r.url()))) problems.push(`${r.status()} ${r.url()}`);
  });
  return problems;
}

/** Error messages shown by the app (not Next.js' invisible route announcer, which also has role="alert"). */
export const alertOf = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
