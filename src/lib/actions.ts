import "server-only";
import { unstable_rethrow } from "next/navigation";
import { AdminError } from "./admins";
import { UserError } from "./errors";
import { adminFor, getAdmin, type AdminSession } from "./auth";
import { clientIp } from "./rate-limit";
import { can, type Permission } from "./permissions";

import type { ActionState } from "./action-state";
export type { ActionState };

export { UserError };

export function isExpected(e: unknown): e is Error {
  return e instanceof UserError || e instanceof AdminError || (e instanceof Error && (e as Error & { expected?: boolean }).expected === true);
}

/**
 * Wraps an administrator form action: checks the person is signed in and allowed (on the server, every time), runs the
 * action, and turns expected problems into a message. Unexpected errors are logged and never leak details.
 */
export async function adminAction(
  permission: Permission | null,
  fn: (admin: AdminSession, ip: string) => Promise<string | void | { message?: string; data?: Record<string, unknown> }>,
  opts: { allowMustChange?: boolean } = {},
): Promise<ActionState> {
  try {
    let admin: AdminSession;
    if (permission) {
      const g = await adminFor(permission);
      if ("error" in g) return { error: g.error === 401 ? "Please sign in again." : "You don’t have permission to do that." };
      admin = g.admin;
    } else {
      const a = await getAdmin();
      if (!a || (a.mustChangePassword && !opts.allowMustChange)) return { error: "Please sign in again." };
      admin = a;
    }
    if (permission && !can(admin.role, permission)) return { error: "You don’t have permission to do that." };
    const out = await fn(admin, await clientIp());
    if (out && typeof out === "object") return { ok: true, message: out.message ?? "Saved.", data: out.data };
    return { ok: true, message: out ?? "Saved." };
  } catch (e) {
    unstable_rethrow(e);
    if (isExpected(e)) return { error: e.message };
    console.error("[action] unexpected error", e);
    return { error: "Something went wrong and nothing was changed. Please try again." };
  }
}

export const fd = (form: FormData, name: string): string => String(form.get(name) ?? "").trim();
export const fdOptional = (form: FormData, name: string): string | null => fd(form, name) || null;
export const fdBool = (form: FormData, name: string): boolean => form.get(name) === "on" || form.get(name) === "true";
export function fdInt(form: FormData, name: string, fallback = 0): number {
  const v = fd(form, name);
  if (v === "") return fallback;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new UserError("Please enter a whole number.");
  return n;
}
