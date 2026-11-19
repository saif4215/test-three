import { requireAdmin } from "@/lib/auth";
import { listPolicyPages } from "@/lib/content";
import { AdminHeading, Section } from "@/components/admin-ui";
import { ActionForm, SubmitButton } from "@/components/admin-forms";
import { Alert, Badge } from "@/components/ui";
import { savePolicyAction } from "../actions";

export const metadata = { title: "Policy pages" };

export default async function PolicyPages() {
  await requireAdmin("content.manage");
  const pages = await listPolicyPages();
  return (
    <>
      <AdminHeading title="Policy pages">Terms, privacy and returns text must come from ICSI. A page stays hidden until it has text <em>and</em> is marked “ICSI-approved”.</AdminHeading>
      <div className="mb-6"><Alert tone="warn" title="Nothing here is pre-filled on purpose">This site does not invent policies. Paste the wording ICSI has approved (ideally reviewed by someone qualified).</Alert></div>
      {pages.map((p) => (
        <Section key={p.slug} title={p.title} id={p.slug} actions={<Badge tone={p.approved && p.body_md.trim() ? "ok" : "warn"}>{p.approved && p.body_md.trim() ? "live" : "hidden"}</Badge>}>
          <ActionForm action={savePolicyAction}>
            <input type="hidden" name="slug" value={p.slug} />
            <label htmlFor={`b-${p.slug}`} className="sr-only">{p.title} text</label>
            <textarea id={`b-${p.slug}`} name="body" defaultValue={p.body_md} className="field !min-h-56 font-mono text-sm" maxLength={50000} placeholder="Paste the approved text here (Markdown is fine)." />
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="approved" defaultChecked={p.approved} className="mt-0.5 size-5 accent-[var(--brand)]" /> <span><strong>ICSI-approved:</strong> show this page to customers. Only tick this once the text has been approved.</span></label>
            <SubmitButton>Save {p.title}</SubmitButton>
          </ActionForm>
        </Section>
      ))}
    </>
  );
}
