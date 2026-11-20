/**
 * Adds the structure a new store needs (suggested categories, empty policy pages, the homepage record). It NEVER
 * adds products or prices and NEVER changes or removes anything that already exists: running it twice is harmless.
 *   npm run db:seed
 */
import { loadEnv } from "./_env";
loadEnv();

const CATEGORIES = [
  { name: "Shirts & Polos", slug: "shirts-and-polos", sort: 10 },
  { name: "Hoodies & Sweatshirts", slug: "hoodies-and-sweatshirts", sort: 20 },
  { name: "Accessories", slug: "accessories", sort: 30 },
  { name: "Other Merchandise", slug: "other-merchandise", sort: 40 },
  { name: "Uniforms", slug: "uniforms", sort: 50 },
];

export async function seedBaseline() {
  const { pool } = await import("../src/lib/db");
  const { runMigrations } = await import("../src/lib/migrate");
  await runMigrations(pool());
  // The suggested categories are added ONCE. If the team later deletes or renames them, a restart must not bring them back.
  const done = await pool().query("select 1 from settings where key = 'baseline_categories_seeded'");
  if (!done.rowCount) {
    const existing = await pool().query("select count(*)::int as n from categories");
    if (existing.rows[0].n === 0) {
      for (const c of CATEGORIES) {
        await pool().query("insert into categories (name, slug, sort, show_on_home) values ($1, $2, $3, true) on conflict (slug) do nothing", [c.name, c.slug, c.sort]);
      }
    }
    await pool().query("insert into settings (key, value) values ('baseline_categories_seeded', 'true'::jsonb) on conflict (key) do nothing");
  }
  for (const [slug, title] of [["returns", "Returns"], ["terms", "Terms of sale"], ["privacy", "Privacy"]]) {
    await pool().query("insert into pages (slug, title, body_md, approved) values ($1, $2, '', false) on conflict (slug) do nothing", [slug, title]);
  }
  await pool().query("insert into site_content (id) values ('main') on conflict (id) do nothing");
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seedBaseline()
    .then(async () => {
      console.log("Baseline structure is in place (categories, empty policy pages). No products were added.");
      const { closePool } = await import("../src/lib/db");
      await closePool();
    })
    .catch((e) => {
      console.error(e.message ?? e);
      process.exit(1);
    });
}
