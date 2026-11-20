import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { Pool } from "pg";

/**
 * Tests run against a REAL PostgreSQL. If TEST_DATABASE_URL is not given, an embedded server is started on port
 * 54330 (data in .data/pg-test, recreated every run) and every migration is applied once.
 */
export default async function setup() {
  let child: ChildProcess | null = null;
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const dir = path.resolve(".data/pg-test");
    fs.rmSync(dir, { recursive: true, force: true });
    child = spawn(process.execPath, ["--import", "tsx", "scripts/dev-db.ts"], {
      env: { ...process.env, DEV_DB_PORT: "54330", DEV_DB_DIR: dir, DEV_DB_NAME: "icsi_test" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("embedded postgres did not start")), 120_000);
      child!.stdout!.on("data", (d) => {
        if (String(d).includes("PostgreSQL ready")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child!.stderr!.on("data", (d) => process.stderr.write(d));
      child!.on("exit", (code) => reject(new Error(`embedded postgres exited early (${code})`)));
    });
    url = "postgres://icsi:icsi-dev-password@localhost:54330/icsi_test";
  }
  process.env.TEST_DATABASE_URL = url;
  const { runMigrations } = await import("../src/lib/migrate");
  const p = new Pool({ connectionString: url });
  await runMigrations(p);
  await p.end();
  return async () => {
    if (child) {
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 1500));
    }
  };
}
