"use server";

import { revalidatePath } from "next/cache";
import { adminAction, fd, UserError, type ActionState } from "@/lib/actions";
import { addInternalNote, changeOrderStatus, recordManualPayment } from "@/lib/orders/manage";
import { isOrderStatus } from "@/lib/orders/status";
import { isUuid } from "@/lib/util";

const idOf = (form: FormData) => {
  const id = fd(form, "id");
  if (!isUuid(id)) throw new UserError("That order wasn’t found.");
  return id;
};

export async function changeStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("orders.manage", async (admin, ip) => {
    const to = fd(form, "to");
    if (!isOrderStatus(to)) throw new UserError("Choose a status.");
    await changeOrderStatus(idOf(form), to, { id: admin.id, label: admin.email }, fd(form, "note"), ip);
    return `Order is now “${to.replace("_", " ")}”.`;
  });
  if (res.ok) revalidatePath("/admin/orders", "layout");
  return res;
}

export async function addNoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("orders.manage", async (admin, ip) => {
    await addInternalNote(idOf(form), String(form.get("note") ?? ""), { id: admin.id, label: admin.email }, ip);
    return "Note saved.";
  });
  if (res.ok) revalidatePath("/admin/orders", "layout");
  return res;
}

export async function recordPaymentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("orders.payment", async (admin, ip) => {
    await recordManualPayment(idOf(form), { id: admin.id, label: admin.email }, fd(form, "note"), ip);
    return "Payment recorded.";
  });
  if (res.ok) revalidatePath("/admin/orders", "layout");
  return res;
}
