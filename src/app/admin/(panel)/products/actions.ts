"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminAction, fd, UserError, type ActionState } from "@/lib/actions";
import { deleteProduct, duplicateProduct, saveProduct, setProductStatus, setStock } from "@/lib/catalog/admin";
import { planImport, runImport } from "@/lib/catalog/import";
import { notifyRestocked } from "@/lib/restock";
import { audit } from "@/lib/audit";
import { addSampleProducts, removeSampleProducts } from "@/lib/demo-data";
import { isUuid } from "@/lib/util";

const label = (a: { email: string; id: string }) => ({ id: a.id, label: a.email });
const idOf = (form: FormData) => {
  const id = fd(form, "id");
  if (!isUuid(id)) throw new UserError("That product wasn’t found.");
  return id;
};

export async function saveProductAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let savedId = "";
  const res = await adminAction("products.manage", async (admin, ip) => {
    let raw: unknown;
    try {
      raw = JSON.parse(String(form.get("payload") ?? ""));
    } catch {
      throw new UserError("We couldn’t read the form. Please reload the page and try again.");
    }
    const intent = fd(form, "intent");
    if (intent === "publish") (raw as { status?: string }).status = "published";
    const saved = await saveProduct(raw, label(admin), ip);
    savedId = saved.id;
    await notifyRestocked().catch(() => 0);
  });
  if (!res.ok) return res;
  revalidatePath("/admin/products");
  redirect(`/admin/products/${savedId}?saved=1`);
}

export async function setStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("products.manage", async (admin, ip) => {
    const status = fd(form, "status");
    if (!["draft", "published", "archived"].includes(status)) throw new UserError("Unknown status.");
    await setProductStatus(idOf(form), status as "draft" | "published" | "archived", label(admin), ip);
    return status === "published" ? "Published." : status === "archived" ? "Archived." : "Moved back to drafts.";
  });
  if (res.ok) revalidatePath("/admin/products");
  return res;
}

export async function duplicateProductAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let newId = "";
  const res = await adminAction("products.manage", async (admin, ip) => {
    newId = await duplicateProduct(idOf(form), label(admin), ip);
  });
  if (!res.ok) return res;
  redirect(`/admin/products/${newId}?copied=1`);
}

export async function deleteProductAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("products.manage", async (admin, ip) => {
    await deleteProduct(idOf(form), label(admin), ip);
    return "Deleted.";
  });
  if (res.ok) revalidatePath("/admin/products");
  return res;
}

export async function setStockAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("inventory.adjust", async (admin, ip) => {
    const id = fd(form, "variantId");
    if (!isUuid(id)) throw new UserError("That option wasn’t found.");
    const raw = fd(form, "stock");
    if (!/^\d{1,7}$/.test(raw)) throw new UserError("Stock must be a whole number, 0 or more.");
    await setStock(id, Number(raw), label(admin), ip);
    await notifyRestocked().catch(() => 0);
    return "Stock updated.";
  });
  if (res.ok) revalidatePath("/admin/inventory");
  return res;
}

export interface ImportCheckData {
  products: number;
  rows: number;
  newCategories: string[];
  skipped: string[];
  problems: { line: number; message: string }[];
  checkedText: string;
}

export async function importCheckAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return adminAction("products.manage", async () => {
    const text = String(form.get("text") ?? "");
    if (text.length > 2_000_000) throw new UserError("That file is too large.");
    const plan = await planImport(text);
    const data: ImportCheckData = { products: plan.products.length, rows: plan.rowCount, newCategories: plan.newCategories, skipped: plan.skipped, problems: plan.problems, checkedText: text };
    return { message: plan.problems.length ? `${plan.problems.length} problem${plan.problems.length === 1 ? "" : "s"} found. Nothing has been saved.` : plan.products.length ? `No problems found. ${plan.products.length} product${plan.products.length === 1 ? "" : "s"} will be created as drafts.` : "No problems found, but there is nothing new to import.", data: data as unknown as Record<string, unknown> };
  });
}

export async function importRunAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("products.manage", async (admin, ip) => {
    const r = await runImport(String(form.get("text") ?? ""), label(admin), ip);
    return `Imported ${r.created} product${r.created === 1 ? "" : "s"} as drafts${r.categories ? ` and created ${r.categories} categor${r.categories === 1 ? "y" : "ies"}` : ""}. Add photos and publish them when they’re ready.`;
  });
  if (res.ok) revalidatePath("/admin/products");
  return res;
}

/**
 * One-click sample products, so a brand-new store can be seen with something in it. After either one the Dashboard is
 * shown again with a note (in the address), because the card that held the button may no longer be there to show it.
 */
export async function addSampleProductsAction(): Promise<ActionState> {
  const res = await adminAction("products.manage", async (admin, ip) => {
    const count = await addSampleProducts(label(admin));
    if (count === 0) throw new UserError("Sample products are already in the store.");
    await audit(label(admin), "sample.add", "product", "", { count }, ip);
  });
  if (!res.ok) return res;
  revalidatePath("/admin", "layout");
  redirect("/admin?notice=samples-added");
}

export async function removeSampleProductsAction(): Promise<ActionState> {
  const res = await adminAction("products.manage", async (admin, ip) => {
    const r = await removeSampleProducts();
    await audit(label(admin), "sample.remove", "product", "", { products: r.products }, ip);
  });
  if (!res.ok) return res;
  revalidatePath("/admin", "layout");
  redirect("/admin?notice=samples-removed");
}
