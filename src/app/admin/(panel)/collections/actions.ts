"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminAction, fd, fdBool, UserError, type ActionState } from "@/lib/actions";
import { deleteCollection, saveCollection } from "@/lib/catalog/collections";
import { loadStoreSettings } from "@/lib/settings";
import { fromLocalInput } from "@/lib/format";
import { isUuid } from "@/lib/util";

export async function saveCollectionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id = "";
  const res = await adminAction("products.manage", async (admin, ip) => {
    const tz = (await loadStoreSettings()).timezone;
    const existing = fd(form, "id");
    id = await saveCollection(
      {
        id: isUuid(existing) ? existing : null,
        title: fd(form, "title"),
        description: fd(form, "description"),
        status: fd(form, "status") === "published" ? "published" : "draft",
        startsAt: fromLocalInput(fd(form, "startsAt"), tz),
        endsAt: fromLocalInput(fd(form, "endsAt"), tz),
        featured: fdBool(form, "featured"),
        productIds: form.getAll("productIds").map(String).filter(isUuid),
      },
      { id: admin.id, label: admin.email },
      ip,
    );
  });
  if (!res.ok) return res;
  revalidatePath("/admin/collections");
  redirect(`/admin/collections/${id}?saved=1`);
}

export async function deleteCollectionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("products.manage", async (admin, ip) => {
    const id = fd(form, "id");
    if (!isUuid(id)) throw new UserError("That collection wasn’t found.");
    await deleteCollection(id, { id: admin.id, label: admin.email }, ip);
    return "Deleted.";
  });
  if (res.ok) revalidatePath("/admin/collections");
  return res;
}
