import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { runSiteCheck, seenFromHeaders, type CheckLevel } from "@/lib/site-check";
import { AdminHeading, Section } from "@/components/admin-ui";
import { Alert, Badge } from "@/components/ui";

export const metadata = { title: "Site check" };

const LEVEL: Record<CheckLevel, { label: string; tone: "ok" | "warn" | "danger" }> = {
  ok: { label: "OK", tone: "ok" },
  warn: { label: "Look at this", tone: "warn" },
  problem: { label: "Needs fixing", tone: "danger" },
};

export default async function SiteCheckPage() {
  await requireAdmin("settings.manage");
  const h = await headers();
  const result = await runSiteCheck(seenFromHeaders((n) => h.get(n)));
  return (
    <>
      <AdminHeading title="Site check" actions={<Link href="/admin/site-check" className="btn-secondary btn-sm">Check again</Link>}>
        A quick look at whether the site is set up properly, in plain words. Nothing here changes anything.
      </AdminHeading>

      <div className="mb-6">
        {result.needAttention === 0 ? (
          <Alert tone="ok" title="Everything looks fine">All the checks below passed.</Alert>
        ) : (
          <Alert tone={result.worst === "problem" ? "danger" : "warn"} title={`${result.needAttention} ${result.needAttention === 1 ? "thing needs" : "things need"} a look`}>
            Each one below says what it means and what to do.
          </Alert>
        )}
      </div>

      <Section title="Checks">
        <ul className="divide-y divide-line">
          {result.items.map((i) => (
            <li key={i.id} className="py-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-medium">{i.title}</h3>
                <Badge tone={LEVEL[i.level].tone}>{LEVEL[i.level].label}</Badge>
              </div>
              <p className="mt-1 text-muted">{i.detail}</p>
              {i.fix ? <p className="mt-1.5"><strong className="font-semibold">What to do:</strong> {i.fix}</p> : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Optional services">
        <p className="mb-3 text-sm text-muted">These are not needed to run the store. Each stays off until it is set up and tested in <Link href="/admin/settings#integrations" className="underline underline-offset-4">Settings</Link>.</p>
        <ul className="divide-y divide-line">
          {result.services.map((s) => (
            <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="font-medium">{s.label}</span>
              {s.status === "verified" ? <Badge tone="ok">Working</Badge> : s.status === "not-verified" ? <Badge tone="warn">Set up, not tested yet</Badge> : <Badge>Not set up</Badge>}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
