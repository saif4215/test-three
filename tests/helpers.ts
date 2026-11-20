import { beforeAll, afterAll, beforeEach } from "vitest";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://icsi:icsi-dev-password@localhost:54330/icsi_test";
process.env.APP_SECRET = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
process.env.APP_URL = "http://localhost:3000";
process.env.UPLOAD_DIR = "./.data/test-uploads";

export const actor = { id: null as string | null, label: "tester" };

/** Wipes every table (never the migration bookkeeping) so each test starts from an empty store. */
export async function resetDb() {
  const { pool } = await import("../src/lib/db");
  const r = await pool().query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'");
  const names = r.rows.map((x) => `"${x.tablename}"`).join(", ");
  await pool().query(`truncate ${names} restart identity cascade`);
}

export function cleanDbPerTest() {
  beforeAll(async () => {
    await resetDb();
  });
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    const { closePool } = await import("../src/lib/db");
    await closePool();
  });
}

/** Switches features on for a test without needing real outside services (writes the flags directly). */
export async function setFlags(flags: Record<string, boolean>) {
  const { pool } = await import("../src/lib/db");
  for (const [k, v] of Object.entries(flags)) {
    await pool().query("insert into feature_flags (key, enabled) values ($1, $2) on conflict (key) do update set enabled = excluded.enabled", [k, v]);
  }
}

export async function patchSettings(patch: Record<string, unknown>) {
  const { loadStoreSettings, saveStoreSettings } = await import("../src/lib/settings");
  const cur = await loadStoreSettings();
  await saveStoreSettings({ ...cur, ...patch } as typeof cur, actor);
}

export interface MakeProduct {
  name?: string;
  priceCents?: number;
  salePriceCents?: number | null;
  status?: "draft" | "published" | "archived";
  variants?: { size?: string; color?: string; stock?: number; priceCents?: number | null; sku?: string }[];
  trackInventory?: boolean;
  categoryIds?: string[];
  featured?: boolean;
  tags?: string[];
}

export async function makeProduct(o: MakeProduct = {}) {
  const { saveProduct } = await import("../src/lib/catalog/admin");
  const saved = await saveProduct(
    {
      name: o.name ?? "Test Polo",
      priceCents: o.priceCents ?? 2000,
      salePriceCents: o.salePriceCents ?? null,
      status: o.status ?? "published",
      trackInventory: o.trackInventory ?? true,
      categoryIds: o.categoryIds ?? [],
      featured: o.featured ?? false,
      tags: o.tags ?? [],
      variants: (o.variants ?? [{ size: "M", color: "Navy", stock: 10 }]).map((v) => ({ size: "", color: "", stock: 0, priceCents: null, ...v })),
    },
    actor,
  );
  const { query } = await import("../src/lib/db");
  const vars = (await query<{ id: string; size: string; color: string; stock: number }>("select id, size, color, stock from product_variants where product_id = $1 order by sort", [saved.id])).rows;
  return { ...saved, variants: vars };
}

/** Everything that places an order needs the shop open: cart + order requests on. */
export async function openShop() {
  await setFlags({ cart: true, order_requests: true });
  await patchSettings({ requireTermsAcceptance: false });
}

export const customer = { name: "Pat Parent", email: "pat@example.com" };
