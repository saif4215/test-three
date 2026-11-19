"use server";

import { requestRestock } from "@/lib/restock";
import { clientIp } from "@/lib/rate-limit";
import { isExpected, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";

export async function requestRestockAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  // A hidden field real people never see: bots fill it in, and get a polite success without anything being stored.
  if (String(form.get("website") ?? "").trim()) return { ok: true, message: "Thanks! Check your email and confirm to finish setting up the alert." };
  try {
    const message = await requestRestock(String(form.get("variantId") ?? ""), String(form.get("email") ?? ""), form.get("consent") === "on", await clientIp());
    return { ok: true, message };
  } catch (e) {
    if (isExpected(e) || e instanceof UserError) return { error: (e as Error).message };
    console.error("[restock] unexpected error", e);
    return { error: "Something went wrong. Please try again." };
  }
}
