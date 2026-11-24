/**
 * OPTIONAL sample data so you can preview the store before adding real merchandise.
 *   npm run db:seed:demo     -> adds clearly labelled "Sample ..." products (published, so you can see them)
 *   npm run db:unseed:demo   -> removes every sample product again
 * (The admin Dashboard has the same two buttons.)
 *
 * These are NOT real ICSI products, prices or photos. Images are unbranded sample illustrations (see src/lib/demo-art.ts).
 * Real orders can reference them, so remove them before launch.
 */
import { loadEnv } from "./_env";
loadEnv();

async function main() {
  const { pool, closePool } = await import("../src/lib/db");
  const { runMigrations } = await import("../src/lib/migrate");
  const { addSampleProducts, removeSampleProducts } = await import("../src/lib/demo-data");
  const { seedBaseline } = await import("./seed");
  await runMigrations(pool());

  if (process.argv.includes("--remove")) {
    const r = await removeSampleProducts();
    console.log(`Removed ${r.products} sample products and ${r.images} unused images.`);
    return closePool();
  }

  await seedBaseline();
  const added = await addSampleProducts({ id: null, label: "demo seed" });
  console.log(added ? `Added ${added} clearly labelled sample products. Remove them with: npm run db:unseed:demo` : "Sample products already exist. Run `npm run db:unseed:demo` first to recreate them.");
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
