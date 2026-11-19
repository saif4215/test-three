import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Pool } from "pg";

const LOCK_ID = 727_001;

/**
 * Applies every `db/migrations/*.sql` file that has not been applied yet, in name order, each in its own
 * transaction, under an advisory lock so two servers starting together cannot collide. It only ever adds.
 */
export async function runMigrations(pool: Pool, dir = path.resolve(process.cwd(), "db/migrations")): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(`create table if not exists schema_migrations (
      name text primary key, checksum text not null, applied_at timestamptz not null default now())`);
    const done = new Map((await client.query<{ name: string; checksum: string }>("select name, checksum from schema_migrations")).rows.map((r) => [r.name, r.checksum]));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      if (done.has(file)) {
        if (done.get(file) !== checksum) console.warn(`[migrate] ${file} was changed after it was applied. It is NOT re-run: add a new migration instead.`);
        continue;
      }
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into schema_migrations (name, checksum) values ($1, $2)", [file, checksum]);
        await client.query("commit");
        applied.push(file);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    try {
      await client.query("select pg_advisory_unlock($1)", [LOCK_ID]);
    } finally {
      client.release();
    }
  }
  return applied;
}
