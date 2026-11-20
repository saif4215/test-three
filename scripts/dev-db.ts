/**
 * Starts a throw-away local PostgreSQL (embedded, no installation needed) for development and tests.
 *   npm run db:dev      ->  postgres://icsi:icsi-dev-password@localhost:54329/icsi_store
 * Data lives in .data/pg and survives restarts. Never use this for production: use a managed PostgreSQL.
 */
import fs from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PORT = Number(process.env.DEV_DB_PORT ?? 54329);
const DIR = path.resolve(process.env.DEV_DB_DIR ?? ".data/pg");
const NAME = process.env.DEV_DB_NAME ?? "icsi_store";
if (!/^[a-z0-9_]+$/.test(NAME)) throw new Error("DEV_DB_NAME may only contain a-z, 0-9 and _");

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DIR,
    user: "icsi",
    password: "icsi-dev-password",
    port: PORT,
    persistent: true,
    // Postgres refuses to run as root (the case in containers); the library then makes a helper user.
    createPostgresUser: typeof process.getuid === "function" && process.getuid() === 0,
    onLog: () => {},
    onError: (e) => {
      const m = String(e instanceof Error ? e.message : e);
      if (/FATAL|PANIC|could not/i.test(m)) console.error(m);
    },
  });
  fs.mkdirSync(path.dirname(DIR), { recursive: true });
  if (!fs.existsSync(path.join(DIR, "PG_VERSION"))) await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  const exists = await client.query("select 1 from pg_database where datname = $1", [NAME]);
  if (!exists.rowCount) await client.query(`create database "${NAME}"`);
  await client.end();
  console.log(`PostgreSQL ready: postgres://icsi:icsi-dev-password@localhost:${PORT}/${NAME}`);

  const stop = async () => {
    try {
      await pg.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => {}, 1 << 30);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
