/**
 * OPTIONAL sample data so you can preview the store before adding real merchandise.
 *   npm run db:seed:demo     -> adds clearly labelled "Sample ..." products (published, so you can see them)
 *   npm run db:unseed:demo   -> removes every sample product again
 *
 * These are NOT real ICSI products, prices or photos. Images are unbranded sample illustrations (see demo-art.ts).
 * Real orders can reference them, so remove them before launch.
 */
import { loadEnv } from "./_env";
loadEnv();
import sharp from "sharp";
import { productSvg, type Shape } from "./demo-art";

interface Demo {
  name: string;
  shape: Shape;
  colors: [string, string][];
  sizes: string[];
  price: number;
  sale?: number;
  category: string;
  stock: number;
  featured?: boolean;
  desc: string;
  short: string;
}

const DEMOS: Demo[] = [
  { name: "Sample Polo Shirt", shape: "polo", colors: [["Navy", "#1f2f5c"], ["White", "#f5f5f5"]], sizes: ["YS", "YM", "YL", "S", "M", "L", "XL"], price: 2000, category: "shirts-and-polos", stock: 12, featured: true, short: "Classic polo", desc: "Sample product for previewing the layout. Replace with real merchandise." },
  { name: "Sample Spirit Tee", shape: "tee", colors: [["Green", "#14532d"]], sizes: ["S", "M", "L", "XL"], price: 1500, sale: 1200, category: "shirts-and-polos", stock: 8, featured: true, short: "Everyday tee", desc: "Sample product with a sale price." },
  { name: "Sample Hooded Sweatshirt", shape: "hoodie", colors: [["Grey", "#7b8088"], ["Black", "#222222"]], sizes: ["S", "M", "L"], price: 3500, category: "hoodies-and-sweatshirts", stock: 3, featured: true, short: "Pullover hoodie", desc: "Sample product with low stock on some options." },
  { name: "Sample Crewneck Sweatshirt", shape: "sweat", colors: [["Maroon", "#6b1d2a"]], sizes: ["M", "L"], price: 3000, category: "hoodies-and-sweatshirts", stock: 0, short: "Crewneck", desc: "Sample product that is sold out (try the back-in-stock form)." },
  { name: "Sample Baseball Cap", shape: "cap", colors: [["Navy", "#1f2f5c"]], sizes: [], price: 1800, category: "accessories", stock: 20, short: "Adjustable cap", desc: "Sample product with no size options." },
  { name: "Sample Tote Bag", shape: "bag", colors: [["Natural", "#d9c9a3"]], sizes: [], price: 1000, category: "accessories", stock: 15, short: "Canvas tote", desc: "Sample product." },
  { name: "Sample Water Bottle", shape: "bottle", colors: [["Teal", "#1e8a8a"]], sizes: [], price: 1400, category: "other-merchandise", stock: 30, short: "Reusable bottle", desc: "Sample product with a single option." },
  { name: "Sample Ceramic Mug", shape: "mug", colors: [["White", "#f2f2f0"], ["Black", "#2a2a2a"]], sizes: [], price: 1200, category: "other-merchandise", stock: 18, short: "11 oz mug", desc: "Sample product." },
];

async function main() {
  const { pool, closePool } = await import("../src/lib/db");
  const { runMigrations } = await import("../src/lib/migrate");
  const { saveImage, purgeOrphanedAssets } = await import("../src/lib/media");
  const { saveProduct } = await import("../src/lib/catalog/admin");
  const { seedBaseline } = await import("./seed");
  await runMigrations(pool());

  if (process.argv.includes("--remove")) {
    const r = await pool().query("delete from products where is_demo returning id");
    await pool().query("update media_assets set created_at = now() - interval '3 days' where id not in (select asset_id from product_images)");
    const purged = await purgeOrphanedAssets();
    console.log(`Removed ${r.rowCount} sample products and ${purged} unused images.`);
    return closePool();
  }

  await seedBaseline();
  if ((await pool().query("select 1 from products where is_demo limit 1")).rowCount) {
    console.log("Sample products already exist. Run `npm run db:unseed:demo` first to recreate them.");
    return closePool();
  }
  const actor = { id: null as string | null, label: "demo seed" };
  for (const d of DEMOS) {
    const cats = (await pool().query<{ id: string }>("select id from categories where slug = $1", [d.category])).rows;
    const images = [];
    for (const [cname, hex] of d.colors) {
      const png = await sharp(productSvg(d.shape, cname, hex), { density: 144 }).png().toBuffer();
      const alt = `${d.name} in ${cname} (sample picture)`;
      const asset = await saveImage(png, { alt });
      images.push({ assetId: asset.id, alt, color: d.colors.length > 1 ? cname : "", isPrimary: images.length === 0 });
    }
    const sizes = d.sizes.length ? d.sizes : [""];
    const variants = sizes.flatMap((size, si) =>
      d.colors.map(([cname]) => ({ id: null, sku: "", size, color: d.colors.length > 1 || d.sizes.length === 0 ? cname : "", priceCents: null, stock: d.stock === 3 ? (si % 2 === 0 ? 3 : 20) : d.stock, lowStockThreshold: null, active: true })),
    );
    const saved = await saveProduct(
      { name: d.name, shortDescription: d.short, description: d.desc, status: "published", priceCents: d.price, salePriceCents: d.sale ?? null, tags: ["sample", d.shape], featured: !!d.featured, trackInventory: true, lowStockThreshold: 5, categoryIds: cats.map((c) => c.id), images, variants },
      actor,
    );
    await pool().query("update products set is_demo = true where id = $1", [saved.id]);
  }
  console.log(`Added ${DEMOS.length} clearly labelled sample products. Remove them with: npm run db:unseed:demo`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
