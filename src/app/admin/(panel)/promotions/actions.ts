"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminAction, fd, fdBool, UserError, type ActionState } from "@/lib/actions";
import { deletePromotion, savePromotion } from "@/lib/promotions";
import { loadStoreSettings } from "@/lib/settings";
import { fromLocalInput } from "@/lib/format";
import { isUuid, parseMoneyToCents } from "@/lib/util";

export async function savePromotionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id = "";
  const res = await adminAction("promotions.manage", async (admin, ip) => {
    const tz = (await loadStoreSettings()).timezone;
    const kind = fd(form, "kind") === "fixed" ? "fixed" : "percent";
    const rawValue = fd(form, "value");
    let value: number;
    if (kind === "percent") {
      value = Number(rawValue);
      if (!Number.isInteger(value)) throw new UserError("Enter the percentage as a whole number, such as 10.");
    } else {
      const c = parseMoneyToCents(rawValue);
      if (c === null) throw new UserError("Enter the discount in dollars, such as 5 or 7.50.");
      value = c;
    }
    const min = fd(form, "minSubtotal");
    const minCents = min ? parseMoneyToCents(min) : 0;
    if (minCents === null) throw new UserError("Enter the minimum order in dollars, such as 25.");
    const maxUses = fd(form, "maxUses");
    const existing = fd(form, "id");
    id = await savePromotion(
      { id: isUuid(existing) ? existing : null, code: fd(form, "code"), kind, value, minSubtotalCents: minCents, startsAt: fromLocalInput(fd(form, "startsAt"), tz), endsAt: fromLocalInput(fd(form, "endsAt"), tz), maxUses: maxUses ? Number(maxUses) : null, active: fdBool(form, "active") },
      { id: admin.id, label: admin.email },
      ip,
    );
  });
  if (!res.ok) return res;
  revalidatePath("/admin/promotions");
  redirect(`/admin/promotions/${id}?saved=1`);
}

export async function deletePromotionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("promotions.manage", async (admin, ip) => {
    const id = fd(form, "id");
    if (!isUuid(id)) throw new UserError("That promotion wasn’t found.");
    await deletePromotion(id, { id: admin.id, label: admin.email }, ip);
    return "Deleted.";
  });
  if (res.ok) revalidatePath("/admin/promotions");
  return res;
}
