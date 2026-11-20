import { loadEnv } from "./_env";
loadEnv();

async function main() {
  const { pool, closePool } = await import("../src/lib/db");
  const { runMigrations } = await import("../src/lib/migrate");
  const applied = await runMigrations(pool());
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
  await closePool();
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
