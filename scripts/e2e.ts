/**
 * End-to-end test runner.
 *
 *   npm run e2e                 build, start everything, run every browser test, shut down
 *   npm run e2e -- --serve      build and start everything, then wait (run `npx playwright test -c e2e/playwright.config.ts` yourself)
 *   npm run e2e -- --no-build   reuse the last build
 *   npm run e2e -- <playwright args>   e.g. a spec file name
 *
 * It starts: a throw-away PostgreSQL, local stand-ins for Google sign-in, Stripe, an SMTP mail server and the Anthropic API
 * (so those code paths run for real without any account or money), a production build of the store, and a small control
 * server the browser tests use to steer the stand-ins. Nothing here talks to the internet.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { startFakeGoogle } from "../tests/stand-ins/google";
import { startFakeAnthropic } from "../tests/stand-ins/anthropic";
import { startFakeSmtp } from "../tests/stand-ins/smtp";
import { startFakeStripe } from "../tests/stand-ins/stripe";

type Env = NodeJS.ProcessEnv;
const PORTS = { pg: 54331, app: 3100, google: 4100, anthropic: 4101, smtp: 4102, stripe: 4103, control: 4199 };
const APP = `http://localhost:${PORTS.app}`;
const args = process.argv.slice(2);
const serve = args.includes("--serve");
const noBuild = args.includes("--no-build");
const passthrough = args.filter((a) => !["--serve", "--no-build"].includes(a));

const children: ChildProcess[] = [];
const groups: ChildProcess[] = [];
const closers: (() => Promise<void>)[] = [];

/** Every port the run needs must be free, otherwise an old server could silently answer in place of the new one. */
async function assertPortsFree() {
  const net = await import("node:net");
  for (const [name, port] of Object.entries(PORTS)) {
    const inUse = await new Promise<boolean>((resolve) => {
      const s = net.createConnection({ port, host: "127.0.0.1" });
      s.once("connect", () => {
        s.destroy();
        resolve(true);
      });
      s.once("error", () => resolve(false));
    });
    if (inUse) throw new Error(`Port ${port} (${name}) is already in use. Stop the earlier run first.`);
  }
}

function run(cmd: string, cmdArgs: string[], env: Env, label: string) {
  const r = spawnSync(cmd, cmdArgs, { env, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status})`);
}

async function waitFor(url: string, ms = 120_000) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > end) throw new Error(`Timed out waiting for ${url}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function shutdown() {
  for (const g of groups) {
    try {
      if (g.pid) process.kill(-g.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
  for (const c of children) c.kill("SIGTERM");
  for (const close of closers) await close().catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
}

async function main() {
  await assertPortsFree();
  const dbDir = path.resolve(".data/pg-e2e");
  fs.rmSync(dbDir, { recursive: true, force: true });
  fs.rmSync(path.resolve(".data/e2e-uploads"), { recursive: true, force: true });
  fs.rmSync(path.resolve(".data/e2e-auth"), { recursive: true, force: true }); // remembered browser sign-ins belong to the previous database

  // 1. database
  const db = spawn(process.execPath, ["--import", "tsx", "scripts/dev-db.ts"], {
    env: { ...process.env, DEV_DB_PORT: String(PORTS.pg), DEV_DB_DIR: dbDir, DEV_DB_NAME: "icsi_e2e" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  children.push(db);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("database did not start")), 120_000);
    db.stdout!.on("data", (d) => {
      if (String(d).includes("PostgreSQL ready")) {
        clearTimeout(t);
        resolve();
      }
    });
    db.on("exit", (c) => reject(new Error(`database exited early (${c})`)));
  });

  // 2. stand-ins
  const google = await startFakeGoogle(PORTS.google);
  const anthropic = await startFakeAnthropic(PORTS.anthropic);
  const smtp = await startFakeSmtp(PORTS.smtp);
  const stripe = await startFakeStripe(APP, PORTS.stripe);
  closers.push(() => google.close(), () => anthropic.close(), () => smtp.close(), () => stripe.close());

  const env: Env = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_DIST_DIR: ".next-e2e",
    DATABASE_URL: `postgres://icsi:icsi-dev-password@localhost:${PORTS.pg}/icsi_e2e`,
    APP_URL: APP,
    APP_SECRET: "e2e-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
    STORAGE_DRIVER: "local",
    UPLOAD_DIR: ".data/e2e-uploads",
    ADMIN_SETUP_TOKEN: "",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtp.port),
    SMTP_USER: smtp.user,
    SMTP_PASS: smtp.pass,
    SMTP_SECURE: "0",
    EMAIL_FROM: "ICSI Store <store@example.org>",
    STRIPE_API_BASE: stripe.url,
    STRIPE_SECRET_KEY: stripe.secretKey,
    STRIPE_WEBHOOK_SECRET: stripe.webhookSecret,
    ANTHROPIC_API_KEY: anthropic.key,
    ANTHROPIC_BASE_URL: anthropic.url,
    GOOGLE_CLIENT_ID: google.clientId,
    GOOGLE_CLIENT_SECRET: google.clientSecret,
    GOOGLE_OIDC_BASE_URL: google.url,
  };

  // 3. data
  const tsx = (file: string, extra: string[] = [], over: Record<string, string> = {}) => run("npx", ["tsx", "--conditions=react-server", file, ...extra], { ...env, ...over }, file);
  tsx("scripts/migrate.ts");
  tsx("scripts/seed.ts");
  tsx("scripts/seed-demo.ts");
  const PW = "E2e-Passw0rd!-2026";
  tsx("scripts/create-admin.ts", ["--email", "owner@example.org", "--name", "Olive Owner", "--role", "owner"], { ADMIN_PASSWORD: PW });
  tsx("scripts/create-admin.ts", ["--email", "manager@example.org", "--name", "Max Manager", "--role", "admin"], { ADMIN_PASSWORD: PW });
  tsx("scripts/create-admin.ts", ["--email", "staff@example.org", "--name", "Sam Staff", "--role", "staff"], { ADMIN_PASSWORD: PW });

  // 4. the store
  if (!noBuild) run("npx", ["next", "build"], env, "next build");
  // Started directly (not through `npx`, whose wrapper would survive being killed) and in its own process group.
  const nextBin = path.resolve("node_modules/next/dist/bin/next");
  const app = spawn(process.execPath, [nextBin, "start", "-p", String(PORTS.app)], { env, stdio: ["ignore", "inherit", "inherit"], detached: true });
  groups.push(app);
  await waitFor(`${APP}/api/health`);

  // 5. control server for the browser tests
  const control = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      try {
        switch (`${req.method} ${req.url}`) {
          case "GET /mail":
            return send(200, smtp.messages);
          case "POST /mail/clear":
            smtp.messages.length = 0;
            return send(200, {});
          case "POST /google/user":
            google.setUser(body.user as never);
            return send(200, {});
          case "POST /google/break":
            google.breakNext(body.kind as never);
            return send(200, {});
          case "POST /anthropic/reply":
            anthropic.setReply(String(body.text));
            return send(200, {});
          case "GET /anthropic/bodies":
            return send(200, anthropic.bodies);
          case "GET /stripe/sessions":
            return send(200, stripe.sessions);
          case "POST /stripe/send":
            return send(200, { status: await stripe.send(String(body.sessionId), body.type as never, { amount: body.amount as number | undefined, badSignature: !!body.badSignature }) });
          default:
            return send(404, { error: "unknown" });
        }
      } catch (e) {
        send(500, { error: (e as Error).message });
      }
    });
  });
  await new Promise<void>((r) => control.listen(PORTS.control, "127.0.0.1", r));
  closers.push(() => new Promise<void>((r) => control.close(() => r())));

  const testEnv = { ...env, E2E_BASE_URL: APP, E2E_CONTROL: `http://127.0.0.1:${PORTS.control}`, E2E_PASSWORD: PW, E2E_GOOGLE_URL: google.url, E2E_STRIPE_URL: stripe.url };
  fs.writeFileSync(path.resolve(".data/e2e-env.json"), JSON.stringify({ E2E_BASE_URL: APP, E2E_CONTROL: testEnv.E2E_CONTROL, E2E_PASSWORD: PW, E2E_GOOGLE_URL: google.url, E2E_STRIPE_URL: stripe.url }, null, 2));

  if (serve) {
    console.log(`\nReady. Store at ${APP}  control at ${testEnv.E2E_CONTROL}\nRun tests: E2E_BASE_URL=${APP} E2E_CONTROL=${testEnv.E2E_CONTROL} E2E_PASSWORD=${PW} npx playwright test -c e2e/playwright.config.ts\nCtrl+C to stop.`);
    await new Promise(() => {});
  }
  // Asynchronous on purpose: the stand-ins above live in THIS process, so it must stay free to answer while the tests run.
  const code = await new Promise<number>((resolve) => {
    const pw = spawn("npx", ["playwright", "test", "-c", "e2e/playwright.config.ts", "--trace", "off", ...passthrough], { env: testEnv, stdio: "inherit" });
    pw.on("exit", (c) => resolve(c ?? 1));
  });
  await shutdown();
  process.exit(code);
}

process.on("SIGINT", () => void shutdown().then(() => process.exit(130)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(143)));
main().catch(async (e) => {
  console.error(e);
  await shutdown();
  process.exit(1);
});
