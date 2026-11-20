"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { env } from "@/lib/env";
import { query } from "@/lib/db";
import { safeEqual, verifyPassword } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { countAdmins, createAdminUser, findAdminByEmail, setAdminPassword } from "@/lib/admins";
import { endAdminSession, getAdmin, loginWithPassword, startAdminSession } from "@/lib/auth";
import { checkPassword } from "@/lib/password-policy";
import { completePasswordReset, requestPasswordReset } from "@/lib/password-reset";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isExpected, UserError, fd, type ActionState } from "@/lib/actions";
import { safeNext } from "@/lib/safe-next";

const fail = (e: unknown): ActionState => {
  unstable_rethrow(e);
  if (isExpected(e)) return { error: (e as Error).message };
  console.error("[auth action]", e);
  return { error: "Something went wrong. Please try again." };
};

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let result;
  try {
    result = await loginWithPassword(fd(form, "email"), String(form.get("password") ?? ""));
  } catch (e) {
    return fail(e);
  }
  if (!result.ok) return { error: result.error };
  redirect(result.admin.mustChangePassword ? "/admin/account?required=1" : safeNext(fd(form, "next"), "/admin", "/admin"));
}

export async function logoutAction(): Promise<void> {
  const admin = await getAdmin();
  await endAdminSession();
  if (admin) await audit({ id: admin.id, label: admin.email }, "auth.logout", "admin_user", admin.id, {}, await clientIp());
  redirect("/admin/login");
}

export async function forgotPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requestPasswordReset(fd(form, "email"));
    return { ok: true, message: "If that email belongs to a team member and email is set up, a reset link is on its way. It expires in one hour." };
  } catch (e) {
    return fail(e);
  }
}

export async function resetPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const pw = String(form.get("password") ?? "");
    if (pw !== String(form.get("confirm") ?? "")) throw new UserError("The two passwords don’t match.");
    await completePasswordReset(fd(form, "token"), pw);
  } catch (e) {
    return fail(e);
  }
  redirect("/admin/login?reset=1");
}

/** The very first Owner. Only works while NO administrator exists and ADMIN_SETUP_TOKEN is set; the token must match. */
export async function setupAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    if (!env.adminSetupToken || (await countAdmins()) > 0) throw new UserError("Setup isn’t available.");
    const rl = await rateLimit(`setup:${await clientIp()}`, 10, 900);
    if (!rl.ok) throw new UserError("Too many attempts. Please wait a few minutes.");
    if (!safeEqual(fd(form, "token"), env.adminSetupToken)) throw new UserError("The setup token isn’t correct.");
    const email = fd(form, "email");
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) throw new UserError("The two passwords don’t match.");
    const problem = checkPassword(password, email);
    if (problem) throw new UserError(problem);
    const owner = await createAdminUser({ email, name: fd(form, "name"), password, role: "owner" });
    await audit({ id: owner.id, label: owner.email }, "auth.setup", "admin_user", owner.id, {}, await clientIp());
    await startAdminSession(owner.id);
  } catch (e) {
    return fail(e);
  }
  redirect("/admin");
}

/** Changing your own password. Everyone else's sessions end; this one is kept. */
export async function changePasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await getAdmin();
    if (!admin) throw new UserError("Please sign in again.");
    const current = String(form.get("current") ?? "");
    const next = String(form.get("password") ?? "");
    if (next !== String(form.get("confirm") ?? "")) throw new UserError("The two new passwords don’t match.");
    const row = await findAdminByEmail(admin.email);
    if (!row || !(await verifyPassword(current, row.password_hash))) throw new UserError("Your current password isn’t right.");
    const problem = checkPassword(next, admin.email);
    if (problem) throw new UserError(problem);
    if (current === next) throw new UserError("Choose a password you haven’t used before.");
    await setAdminPassword(admin.id, next, false);
    await startAdminSession(admin.id); // setAdminPassword signed out every session; keep this person signed in
    await audit({ id: admin.id, label: admin.email }, "auth.password_changed", "admin_user", admin.id, {}, await clientIp());
    await query("update admin_users set must_change_password = false where id = $1", [admin.id]);
  } catch (e) {
    return fail(e);
  }
  redirect("/admin");
}
