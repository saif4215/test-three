import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getFeatures } from "@/lib/settings";
import { getIntegrationStates } from "@/lib/integrations";
import { AI_TASKS, AI_TASK_KEYS, AI_TONES } from "@/lib/ai/anthropic";
import { AdminHeading } from "@/components/admin-ui";
import { Alert } from "@/components/ui";
import { AiAssistant } from "@/components/ai-assistant";

export const metadata = { title: "Writing assistant" };

export default async function AiPage() {
  const admin = await requireAdmin("ai.use");
  const features = await getFeatures();
  const states = await getIntegrationStates();
  const ready = features.ai_assistant;
  return (
    <>
      <AdminHeading title="Writing assistant">Drafts titles, descriptions and announcements from facts you provide. You always review the result; nothing is published for you.</AdminHeading>
      {ready ? (
        <>
          <div className="mb-6">
            <Alert tone="info">The assistant only knows what you type here. It is told never to invent prices, dates, events or policies, and to leave a [placeholder] where a fact is missing, but it can still make mistakes. Customer details are never sent.</Alert>
          </div>
          <AiAssistant tasks={AI_TASK_KEYS.map((k) => ({ key: k, label: AI_TASKS[k].label, hint: AI_TASKS[k].hint }))} tones={Object.entries(AI_TONES).map(([key, label]) => ({ key, label }))} />
        </>
      ) : (
        <Alert tone="warn" title="The assistant isn’t switched on">
          {!states.anthropic.configured
            ? "It needs an Anthropic API key to be set on the server first."
            : !states.anthropic.verified
              ? "The key is set but hasn’t been verified yet."
              : "It’s ready to use but hasn’t been switched on."}{" "}
          {can(admin.role, "settings.manage") ? (
            <>
              Set it up under <Link href="/admin/settings#integrations" className="underline">Settings</Link>.
            </>
          ) : (
            "Ask an Owner to set it up."
          )}
        </Alert>
      )}
    </>
  );
}
