"use server";

import { revalidatePath } from "next/cache";
import { adminAction, fd, UserError, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { changeAdminRole, createAdminUser, setAdminActive } from "@/lib/admins";
import { checkPassword } from "@/lib/password-policy";
import { ROLES, type Role } from "@/lib/permissions";
import { isUuid } from "@/lib/util";

const role = (v: string): Role => {
  if (!(ROLES as string[]).includes(v)) throw new UserError("Choose a role.");
  return v as Role;
};

export async function addMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("team.manage", async (admin, ip) => {
    const email = fd(form, "email");
    const password = String(form.get("password") ?? "");
    const r = role(fd(form, "role"));
    const problem = checkPassword(password, email);
    if (problem) throw new UserError(problem);
    const created = await createAdminUser({ email, name: fd(form, "name"), password, role: r, mustChangePassword: true, createdBy: admin.id });
    await audit({ id: admin.id, label: admin.email }, "team.add", "admin_user", created.id, { email: created.email, role: r }, ip);
    return `Added ${created.email}. Give them the temporary password in person or by phone: they must choose their own when they first sign in.`;
  });
  if (res.ok) revalidatePath("/admin/team");
  return res;
}

export async function changeRoleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("team.manage", async (admin) => {
    const id = fd(form, "id");
    if (!isUuid(id)) throw new UserError("That person wasn’t found.");
    await changeAdminRole(id, role(fd(form, "role")), { id: admin.id, label: admin.email });
    return "Role updated.";
  });
  if (res.ok) revalidatePath("/admin/team");
  return res;
}

export async function setActiveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await adminAction("team.manage", async (admin) => {
    const id = fd(form, "id");
    if (!isUuid(id)) throw new UserError("That person wasn’t found.");
    if (id === admin.id) throw new UserError("You can’t remove your own access.");
    const active = fd(form, "active") === "1";
    await setAdminActive(id, active, { id: admin.id, label: admin.email });
    return active ? "Access restored." : "Access revoked. They were signed out immediately.";
  });
  if (res.ok) revalidatePath("/admin/team");
  return res;
}
