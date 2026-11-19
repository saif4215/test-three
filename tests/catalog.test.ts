import { describe, expect, it } from "vitest";
import { actor, makeProduct, cleanDbPerTest } from "./helpers";
import { saveProduct, setStock, listInventory, saveCategory, duplicateProduct, setProductStatus } from "../src/lib/catalog/admin";
import { getFacets, getProductBySlug, listProducts, listPublicCategories } from "../src/lib/catalog/public";
import { planImport, runImport } from "../src/lib/catalog/import";
import { query } from "../src/lib/db";

cleanDbPerTest();

describe("saving products", () => {
  it("creates a product with options and a stable web address", async () => {
    const p = await makeProduct({ name: "Spirit Hoodie", variants: [{ size: "S", color: "Grey", stock: 3 }, { size: "M", color: "Grey", stock: 5 }] });
    expect(p.slug).toBe("spirit-hoodie");
    expect(p.variants).toHaveLength(2);
    const again = await makeProduct({ name: "Spirit Hoodie" });
    expect(again.slug).toBe("spirit-hoodie-2");
  });

  it("refuses a sale price that is not lower than the price", async () => {
    await expect(saveProduct({ name: "X", priceCents: 1000, salePriceCents: 1000, status: "draft" }, actor)).rejects.toThrow(/sale price/i);
  });

  it("refuses two options with the same size and colour", async () => {
    await expect(
      saveProduct({ name: "X", priceCents: 1000, status: "draft", variants: [{ size: "M", color: "Navy" }, { size: "m", color: "navy" }] }, actor),
    ).rejects.toThrow(/only appear once|both/i);
  });

  it("will not publish a photo without a description for screen readers", async () => {
    const { pool } = await import("../src/lib/db");
    const asset = await pool().query<{ id: string }>("insert into media_assets (storage_key, widths, width, height) values ('2026/aaaaaaaaaaaaaaaaaaaaaaaa', '{400}', 400, 500) returning id");
    await expect(
      saveProduct({ name: "Pic", priceCents: 1000, status: "published", images: [{ assetId: asset.rows[0].id, alt: "" }], variants: [{ stock: 1 }] }, actor),
    ).rejects.toThrow(/describe each photo/i);
    await expect(saveProduct({ name: "Pic", priceCents: 1000, status: "draft", images: [{ assetId: asset.rows[0].id, alt: "" }], variants: [{ stock: 1 }] }, actor)).resolves.toBeTruthy();
  });

  it("keeps existing options (and their ids) when a product is edited", async () => {
    const p = await makeProduct({ name: "Cap", variants: [{ size: "S", stock: 1 }, { size: "M", stock: 2 }] });
    const [s, m] = p.variants;
    await saveProduct(
      { id: p.id, name: "Cap", priceCents: 2000, status: "published", variants: [{ id: m.id, size: "S", stock: 9 }, { id: s.id, size: "M", stock: 4 }] },
      actor,
    );
    const after = (await query<{ id: string; size: string; stock: number }>("select id, size, stock from product_variants where product_id = $1 order by size", [p.id])).rows;
    expect(after.find((v) => v.id === m.id)).toMatchObject({ size: "S", stock: 9 });
    expect(after.find((v) => v.id === s.id)).toMatchObject({ size: "M", stock: 4 });
  });
});

describe("what shoppers see", () => {
  it("only lists published products", async () => {
    await makeProduct({ name: "Live" });
    await makeProduct({ name: "Hidden draft", status: "draft" });
    await makeProduct({ name: "Old", status: "archived" });
    const list = await listProducts();
    expect(list.items.map((i) => i.name)).toEqual(["Live"]);
    expect(await getProductBySlug("hidden-draft")).toBeNull();
    expect((await getProductBySlug("hidden-draft", { allowUnpublished: true }))?.status).toBe("draft");
  });

  it("filters by size, colour, price and availability, and sorts", async () => {
    await makeProduct({ name: "Blue Tee", priceCents: 1500, variants: [{ size: "S", color: "Blue", stock: 2 }, { size: "L", color: "Blue", stock: 0 }] });
    await makeProduct({ name: "Red Hoodie", priceCents: 3500, variants: [{ size: "M", color: "Red", stock: 4 }] });
    await makeProduct({ name: "Gone Cap", priceCents: 1000, variants: [{ size: "", color: "Black", stock: 0 }] });
    expect((await listProducts({ size: "l" })).items.map((i) => i.name)).toEqual(["Blue Tee"]);
    expect((await listProducts({ color: "red" })).items.map((i) => i.name)).toEqual(["Red Hoodie"]);
    expect((await listProducts({ minCents: 2000 })).items.map((i) => i.name)).toEqual(["Red Hoodie"]);
    expect((await listProducts({ inStock: true })).items.map((i) => i.name).sort()).toEqual(["Blue Tee", "Red Hoodie"]);
    expect((await listProducts({ sort: "price_asc" })).items.map((i) => i.name)).toEqual(["Gone Cap", "Blue Tee", "Red Hoodie"]);
    expect((await listProducts({ sort: "price_desc" })).items[0].name).toBe("Red Hoodie");
    expect((await listProducts({ q: "hoodie" })).total).toBe(1);
    const gone = (await listProducts({ q: "gone" })).items[0];
    expect(gone.in_stock).toBe(false);
  });

  it("treats search text literally (no wildcards)", async () => {
    await makeProduct({ name: "100% Cotton Tee" });
    await makeProduct({ name: "Plain Tee" });
    expect((await listProducts({ q: "%" })).items.map((i) => i.name)).toEqual(["100% Cotton Tee"]);
    expect((await listProducts({ q: "'; drop table products; --" })).total).toBe(0);
    expect((await query("select count(*) from products")).rows[0].count).toBe("2");
  });

  it("shows the lowest price, the sale, and per-option price overrides", async () => {
    await makeProduct({ name: "Sale Tee", priceCents: 2000, salePriceCents: 1500, variants: [{ size: "S", stock: 5 }] });
    await makeProduct({ name: "Mixed", priceCents: 2000, variants: [{ size: "S", stock: 5 }, { size: "XL", stock: 5, priceCents: 2600 }] });
    const items = (await listProducts({ sort: "name" })).items;
    const mixed = items.find((i) => i.name === "Mixed")!;
    const sale = items.find((i) => i.name === "Sale Tee")!;
    expect(sale).toMatchObject({ effective_price_cents: 1500, original_price_cents: 2000 });
    expect(mixed).toMatchObject({ effective_price_cents: 2000, original_price_cents: null });
    const detail = (await getProductBySlug("mixed"))!;
    expect(detail.variants.find((v) => v.size === "XL")?.unit_price_cents).toBe(2600);
    expect(detail.sizes).toEqual(["S", "XL"]);
  });

  it("sorts clothing sizes in wearing order and builds filter choices", async () => {
    await makeProduct({ name: "Sizes", variants: [{ size: "XL" }, { size: "S" }, { size: "M" }, { size: "YM" }, { size: "L" }].map((v) => ({ ...v, stock: 1 })) });
    expect((await getFacets()).sizes).toEqual(["YM", "S", "M", "L", "XL"]);
  });

  it("paginates", async () => {
    for (let i = 0; i < 5; i++) await makeProduct({ name: `Item ${i}` });
    const page2 = await listProducts({ pageSize: 2, page: 2, sort: "name" });
    expect(page2).toMatchObject({ total: 5, page: 2, pageCount: 3 });
    expect(page2.items.map((i) => i.name)).toEqual(["Item 2", "Item 3"]);
    expect((await listProducts({ pageSize: 2, page: 99 })).page).toBe(3);
  });

  it("counts only published products in categories", async () => {
    const cat = await saveCategory({ name: "Shirts" }, actor);
    await makeProduct({ name: "A", categoryIds: [cat] });
    await makeProduct({ name: "B", categoryIds: [cat], status: "draft" });
    const cats = await listPublicCategories();
    expect(cats.find((c) => c.slug === "shirts")?.product_count).toBe(1);
    expect((await listProducts({ category: "shirts" })).total).toBe(1);
  });
});

describe("stock, copies and status", () => {
  it("sets stock and records it in the activity log", async () => {
    const p = await makeProduct({ variants: [{ size: "M", stock: 1 }] });
    await setStock(p.variants[0].id, 7, actor);
    expect((await listInventory({ defaultThreshold: 5 }))[0].stock).toBe(7);
    expect((await query("select 1 from audit_log where action = 'inventory.set'")).rowCount).toBe(1);
    await expect(setStock(p.variants[0].id, -1, actor)).rejects.toThrow(/whole number/);
  });

  it("duplicates a product as a draft with empty stock", async () => {
    const p = await makeProduct({ name: "Original", variants: [{ size: "M", stock: 9 }] });
    const copy = await duplicateProduct(p.id, actor);
    const row = (await query<{ name: string; status: string }>("select name, status from products where id = $1", [copy])).rows[0];
    expect(row).toEqual({ name: "Original (copy)", status: "draft" });
    expect((await query<{ stock: number }>("select stock from product_variants where product_id = $1", [copy])).rows[0].stock).toBe(0);
  });

  it("publishing needs an active option", async () => {
    const p = await makeProduct({ status: "draft" });
    await query("update product_variants set active = false where product_id = $1", [p.id]);
    await expect(setProductStatus(p.id, "published", actor)).rejects.toThrow(/active/);
  });
});

describe("bulk import", () => {
  const HEADER = "name,category,price,sale_price,description,tags,size,color,sku,stock";

  it("groups rows into products with options and creates drafts only", async () => {
    const csv = [HEADER, "Polo,Uniforms,20,,Soft,school|polo,S,Navy,P-S,5", "Polo,,20,,,,M,Navy,P-M,7", "Mug,Gifts,9.50,,,,,,,3"].join("\n");
    const plan = await planImport(csv);
    expect(plan.problems).toEqual([]);
    expect(plan.products).toHaveLength(2);
    expect(plan.newCategories.sort()).toEqual(["Gifts", "Uniforms"]);
    const result = await runImport(csv, actor);
    expect(result).toMatchObject({ created: 2, categories: 2 });
    const rows = (await query<{ name: string; status: string }>("select name, status from products order by name")).rows;
    expect(rows).toEqual([{ name: "Mug", status: "draft" }, { name: "Polo", status: "draft" }]);
    expect((await query("select count(*) from product_variants")).rows[0].count).toBe("3");
    expect((await listProducts()).total).toBe(0);
  });

  it("saves nothing when any line is wrong, and names the line", async () => {
    const csv = [HEADER, "Good,Gifts,10,,,,,,,1", "Bad,Gifts,abc,,,,,,,1"].join("\n");
    const plan = await planImport(csv);
    expect(plan.problems[0]).toMatchObject({ line: 3 });
    expect(plan.problems[0].message).toMatch(/valid price/);
    await expect(runImport(csv, actor)).rejects.toThrow(/problems/);
    expect((await query("select count(*) from products")).rows[0].count).toBe("0");
  });

  it("leaves existing products alone when the same file is imported again", async () => {
    const csv = [HEADER, "Cap,Gifts,12,,,,,Navy,,4"].join("\n");
    await runImport(csv, actor);
    const plan = await planImport(csv);
    expect(plan.skipped).toEqual(["Cap"]);
    expect(plan.products).toHaveLength(0);
    await expect(runImport(csv, actor)).rejects.toThrow(/nothing new/i);
  });

  it("understands semicolons, tabs and quoted commas", async () => {
    const semi = await planImport(["name;price;size", "Tee;15;S"].join("\n"));
    expect(semi.products).toHaveLength(1);
    const quoted = await planImport(['name,price,description', '"Hat, Wool",12,"Warm, soft ""cap"""'].join("\n"));
    expect(quoted.products[0].name).toBe("Hat, Wool");
    expect(quoted.products[0].description).toBe('Warm, soft "cap"');
  });
});
