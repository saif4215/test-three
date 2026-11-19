import "server-only";
import { query, tx } from "../db";
import { audit, type Actor } from "../audit";
import { parseTable } from "../csv";
import { parseMoneyToCents, slugify } from "../util";
import { UserError } from "../errors";
import { prepareProductInput, saveProductTx, type ProductInput } from "./admin";

/**
 * Bulk import from a spreadsheet. Nothing is saved until the whole file is valid, every product arrives as a DRAFT
 * (so nothing goes live by accident), and a product that already exists by name is left alone.
 */
export const IMPORT_COLUMNS = ["name", "category", "price", "sale_price", "short_description", "description", "tags", "size", "color", "sku", "stock"] as const;
export const IMPORT_TEMPLATE = IMPORT_COLUMNS.join(",");
export const MAX_IMPORT_ROWS = 2000;

export interface ImportProblem {
  line: number;
  message: string;
}

export interface ImportPlan {
  products: ProductInput[];
  newCategories: string[];
  skipped: string[];
  problems: ImportProblem[];
  rowCount: number;
  categoryNames: Map<string, string[]>;
}

export async function planImport(text: string): Promise<ImportPlan> {
  const problems: ImportProblem[] = [];
  const table = parseTable(text);
  const plan: ImportPlan = { products: [], newCategories: [], skipped: [], problems, rowCount: table.rows.length, categoryNames: new Map() };
  const col = (name: string) => table.header.indexOf(name);
  if (col("name") < 0 || col("price") < 0) {
    problems.push({ line: 1, message: "The first row must list the column names, and it needs at least “name” and “price”." });
    return plan;
  }
  if (table.rows.length === 0) {
    problems.push({ line: 1, message: "There are no product rows under the column names." });
    return plan;
  }
  if (table.rows.length > MAX_IMPORT_ROWS) {
    problems.push({ line: 1, message: `That is more than ${MAX_IMPORT_ROWS} rows. Split it into smaller files.` });
    return plan;
  }
  const cell = (r: string[], name: string) => (col(name) >= 0 ? (r[col(name)] ?? "").trim() : "");

  const existing = new Set((await query<{ n: string }>("select lower(name) as n from products")).rows.map((r) => r.n));
  const knownCats = new Map((await query<{ name: string; slug: string }>("select name, slug from categories")).rows.map((c) => [c.name.toLowerCase(), c.slug]));
  const newCats = new Set<string>();

  const groups = new Map<string, { first: number; rows: { line: number; r: string[] }[] }>();
  table.rows.forEach((r, i) => {
    const line = i + 2;
    const name = cell(r, "name");
    if (!name) {
      problems.push({ line, message: "The name is empty. Every row needs the product name (repeat it for each size/colour)." });
      return;
    }
    const g = groups.get(name.toLowerCase()) ?? { first: line, rows: [] };
    g.rows.push({ line, r });
    groups.set(name.toLowerCase(), g);
  });

  for (const [key, g] of groups) {
    const head = g.rows[0].r;
    const name = cell(head, "name");
    if (existing.has(key)) {
      plan.skipped.push(name);
      continue;
    }
    const priceText = g.rows.map(({ r }) => cell(r, "price")).find(Boolean) ?? "";
    const price = parseMoneyToCents(priceText);
    if (price === null) {
      problems.push({ line: g.rows[0].line, message: `“${priceText || "(empty)"}” isn’t a valid price for ${name}. Use numbers such as 20 or 19.99.` });
      continue;
    }
    const saleText = g.rows.map(({ r }) => cell(r, "sale_price")).find(Boolean) ?? "";
    let sale: number | null = null;
    if (saleText) {
      sale = parseMoneyToCents(saleText);
      if (sale === null || sale >= price) {
        problems.push({ line: g.rows[0].line, message: `The sale price for ${name} must be a number below the regular price.` });
        continue;
      }
    }
    const cats = [...new Set(g.rows.flatMap(({ r }) => cell(r, "category").split(/[|;]/).map((c) => c.trim()).filter(Boolean)))];
    for (const c of cats) if (!knownCats.has(c.toLowerCase())) newCats.add(c);
    const variants: ProductInput["variants"] = [];
    let bad = false;
    for (const { line, r } of g.rows) {
      const stockText = cell(r, "stock");
      const stock = stockText === "" ? 0 : Number(stockText);
      if (!Number.isInteger(stock) || stock < 0) {
        problems.push({ line, message: `“${stockText}” isn’t a valid stock number for ${name}. Use a whole number, 0 or more.` });
        bad = true;
        continue;
      }
      const v = { id: null, sku: cell(r, "sku"), size: cell(r, "size"), color: cell(r, "color"), priceCents: null, stock, lowStockThreshold: null, active: true };
      if (variants.some((x) => x.size.toLowerCase() === v.size.toLowerCase() && x.color.toLowerCase() === v.color.toLowerCase())) {
        problems.push({ line, message: `${name} lists the same size and colour twice.` });
        bad = true;
        continue;
      }
      variants.push(v);
    }
    if (bad) continue;
    const pick = (c: string) => g.rows.map(({ r }) => cell(r, c)).find(Boolean) ?? "";
    try {
      plan.products.push(
        prepareProductInput({
          name,
          shortDescription: pick("short_description"),
          description: pick("description"),
          status: "draft",
          priceCents: price,
          salePriceCents: sale,
          tags: pick("tags").split(/[|;]/).map((t) => t.trim()).filter(Boolean),
          categoryIds: [],
          variants,
        }),
      );
      plan.categoryNames.set(key, cats);
    } catch (e) {
      problems.push({ line: g.rows[0].line, message: `${name}: ${(e as Error).message}` });
    }
  }
  plan.newCategories = [...newCats];
  problems.sort((a, b) => a.line - b.line);
  return plan;
}

export async function runImport(text: string, actor: Actor, ip: string | null = null): Promise<{ created: number; skipped: number; categories: number }> {
  const plan = await planImport(text);
  if (plan.problems.length) throw new UserError("The file has problems. Check it again and fix the lines listed.");
  if (plan.products.length === 0) throw new UserError("There is nothing new to import.");
  return tx(async (c) => {
    // One import at a time, so two people pasting the same list can't create everything twice.
    await c.query("select pg_advisory_xact_lock(727002)");
    const cats = new Map((await c.query<{ id: string; name: string }>("select id, name from categories")).rows.map((r) => [r.name.toLowerCase(), r.id]));
    let madeCats = 0;
    for (const name of plan.newCategories) {
      if (cats.has(name.toLowerCase())) continue;
      let slug = slugify(name) || "category";
      for (let n = 2; (await c.query("select 1 from categories where slug = $1", [slug])).rowCount; n++) slug = `${slugify(name)}-${n}`;
      const r = await c.query<{ id: string }>("insert into categories (name, slug) values ($1, $2) returning id", [name, slug]);
      cats.set(name.toLowerCase(), r.rows[0].id);
      madeCats++;
    }
    let created = 0;
    for (const p of plan.products) {
      const names = plan.categoryNames.get(p.name.toLowerCase()) ?? [];
      const clash = await c.query("select 1 from products where lower(name) = lower($1)", [p.name]);
      if (clash.rowCount) continue;
      await saveProductTx(c, { ...p, categoryIds: names.map((n) => cats.get(n.toLowerCase())!).filter(Boolean) }, actor, ip);
      created++;
    }
    await audit(actor, "product.import", "product", "", { created, skipped: plan.skipped.length, categories: madeCats }, ip, c);
    return { created, skipped: plan.skipped.length, categories: madeCats };
  });
}
