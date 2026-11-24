import { describe, expect, it } from "vitest";
import { cleanDbPerTest } from "./helpers";
import { query } from "../src/lib/db";

cleanDbPerTest();

const actor = { id: null, label: "test" };

describe("sample products (the one-click button on the Dashboard)", () => {
  it("adds clearly labelled, published sample products with pictures, in the suggested categories", async () => {
    const { seedBaseline } = await import("../scripts/seed");
    const { addSampleProducts, hasSampleProducts } = await import("../src/lib/demo-data");
    await seedBaseline();
    expect(await hasSampleProducts()).toBe(false);
    expect(await addSampleProducts(actor)).toBe(8);
    expect(await hasSampleProducts()).toBe(true);
    const rows = (await query<{ name: string; status: string; is_demo: boolean }>("select name, status, is_demo from products order by name")).rows;
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.name.startsWith("Sample ") && r.status === "published" && r.is_demo)).toBe(true);
    expect((await query("select 1 from product_images")).rowCount).toBeGreaterThanOrEqual(8);
    expect((await query("select 1 from product_categories")).rowCount).toBeGreaterThanOrEqual(8);
  });

  it("does nothing the second time, so pressing the button twice never doubles them", async () => {
    const { seedBaseline } = await import("../scripts/seed");
    const { addSampleProducts } = await import("../src/lib/demo-data");
    await seedBaseline();
    await addSampleProducts(actor);
    expect(await addSampleProducts(actor)).toBe(0);
    expect((await query("select 1 from products")).rowCount).toBe(8);
  });

  it("removes only the sample products, and the pictures only they used; real products stay", async () => {
    const { seedBaseline } = await import("../scripts/seed");
    const { addSampleProducts, removeSampleProducts, hasSampleProducts } = await import("../src/lib/demo-data");
    const { saveProduct } = await import("../src/lib/catalog/admin");
    await seedBaseline();
    await addSampleProducts(actor);
    await saveProduct(
      { name: "Real Hoodie", shortDescription: "", description: "", status: "published", priceCents: 4000, salePriceCents: null, tags: [], featured: false, trackInventory: true, lowStockThreshold: 5, categoryIds: [], images: [], variants: [{ id: null, sku: "", size: "", color: "", priceCents: null, stock: 5, lowStockThreshold: null, active: true }] },
      actor,
    );
    const r = await removeSampleProducts();
    expect(r.products).toBe(8);
    expect(await hasSampleProducts()).toBe(false);
    expect((await query<{ name: string }>("select name from products")).rows.map((x) => x.name)).toEqual(["Real Hoodie"]);
    expect((await query("select 1 from product_images")).rowCount).toBe(0);
  });
});
