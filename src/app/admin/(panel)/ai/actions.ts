"use server";

import { adminAction, fd, UserError, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { isFeatureOn, loadStoreSettings } from "@/lib/settings";
import { rateLimit } from "@/lib/rate-limit";
import { AI_TASK_KEYS, AI_TONES, draftWithAi, type AiTask, type AiTone } from "@/lib/ai/anthropic";

export async function draftAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return adminAction("ai.use", async (admin, ip) => {
    if (!(await isFeatureOn("ai_assistant"))) throw new UserError("The AI writing assistant isn’t switched on, or isn’t verified yet. An Owner can set it up under Settings.");
    const task = fd(form, "task") as AiTask;
    const tone = fd(form, "tone") as AiTone;
    if (!AI_TASK_KEYS.includes(task) || !(tone in AI_TONES)) throw new UserError("Choose what to write and a tone.");
    const rl = await rateLimit(`ai:${admin.id}`, 20, 600);
    if (!rl.ok) throw new UserError("That’s a lot of drafts in a short time. Please wait a few minutes.");
    const { storeName } = await loadStoreSettings();
    const draft = await draftWithAi({ task, tone, notes: String(form.get("notes") ?? ""), storeName });
    // Only the kind of request is logged: never the text itself.
    await audit({ id: admin.id, label: admin.email }, "ai.use", "ai", task, { task, model: draft.model }, ip);
    return { message: "Draft ready. Read it carefully before you use it.", data: { text: draft.text } };
  });
}
