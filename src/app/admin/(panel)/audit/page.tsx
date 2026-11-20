import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { describeAction } from "@/lib/admin-stats";
import { getStoreSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/format";
import { AdminHeading, DataTable, Td, Th } from "@/components/admin-ui";
import { EmptyState, Pagination } from "@/components/ui";

export const metadata = { title: "Activity log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdmin("audit.view");
  const sp = await searchParams;
  const settings = await getStoreSettings();
  const page = Math.max(1, Number(sp.page) || 1);
  const params: unknown[] = [];
  let where = "";
  if (sp.q?.trim()) {
    params.push(`%${sp.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    where = "where action ilike $1 or actor_label ilike $1 or entity ilike $1";
  }
  const total = Number((await query<{ n: string }>(`select count(*) as n from audit_log ${where}`, params)).rows[0].n);
  const rows = (await query<{ id: string; action: string; actor_label: string; entity: string; created_at: Date; detail: Record<string, unknown>; ip: string | null }>(`select id::text, action, actor_label, entity, created_at, detail, ip from audit_log ${where} order by created_at desc limit 50 offset ${(page - 1) * 50}`, params)).rows;
  return (
    <>
      <AdminHeading title="Activity log">Who did what, and when. Passwords and keys are never recorded here.</AdminHeading>
      <form method="get" className="card mb-6 flex flex-wrap items-end gap-4 p-5">
        <div className="min-w-[16rem] flex-1"><label htmlFor="q" className="label">Search</label><input id="q" name="q" defaultValue={sp.q} className="field" placeholder="Action, person or record type" /></div>
        <div className="flex gap-2"><button type="submit" className="btn-primary">Search</button><Link href="/admin/audit" className="btn-secondary">Reset</Link></div>
      </form>
      {rows.length === 0 ? <EmptyState title="Nothing logged yet" /> : (
        <DataTable caption="Activity">
          <thead><tr><Th>When</Th><Th>Who</Th><Th>What</Th><Th>From</Th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><Td className="whitespace-nowrap text-muted">{formatDateTime(r.created_at, settings.timezone)}</Td><Td>{r.actor_label}</Td><Td>{describeAction(r.action, r.detail)}<div className="text-xs text-muted">{r.action}</div></Td><Td className="text-muted">{r.ip ?? "—"}</Td></tr>)}</tbody>
        </DataTable>
      )}
      <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / 50))} basePath="/admin/audit" query={{ q: sp.q }} />
    </>
  );
}
