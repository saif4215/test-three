"use server";

import { revalidatePath } from "next/cache";
import { adminAction, fd, fdBool, fdInt, UserError, type ActionState } from "@/lib/actions";
import { deleteCategory, saveCategory } from "@/lib/catalog/admin";
import { isUuid } from "@/lib/util";

export async function saveCategoryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("products.manage", async (admin, ip) => {
    const id = fd(form, "id");
    await saveCategory({ id: isUuid(id) ? id : null, name: fd(form, "name"), description: fd(form, "description"), sort: fdInt(form, "sort", 0), showOnHome: fdBool(form, "showOnHome"), imageAssetId: fd(form, "imageAssetId") || null }, { id: admin.id, label: admin.email }, ip);
    return id ? "Saved." : "Category added.";
  });
  if (res.ok) revalidatePath("/admin/categories");
  return res;
}

export async function deleteCategoryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("products.manage", async (admin, ip) => {
    const id = fd(form, "id");
    if (!isUuid(id)) throw new UserError("That category wasn’t found.");
    await deleteCategory(id, { id: admin.id, label: admin.email }, ip);
    return "Deleted.";
  });
  if (res.ok) revalidatePath("/admin/categories");
  return res;
}
