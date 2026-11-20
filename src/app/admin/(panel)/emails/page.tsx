import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { getFeatures, getStoreSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/format";
import { AdminHeading, DataTable, Td, Th } from "@/components/admin-ui";
import { ActionForm, SubmitButton } from "@/components/admin-forms";
import { Alert, Badge, EmptyState } from "@/components/ui";
import { retryEmailsAction } from "./actions";

export const metadata = { title: "Email log" };

export default async function EmailsPage() {
  await requireAdmin("settings.manage");
  const [features, settings] = await Promise.all([getFeatures(), getStoreSettings()]);
  const rows = (await query<{ id: string; to_email: string; subject: string; template: string; status: string; attempts: number; last_error: string | null; created_at: Date }>("select id, to_email, subject, template, status, attempts, last_error, created_at from email_outbox order by created_at desc limit 100")).rows;
  const failed = rows.filter((r) => r.status === "failed").length;
  return (
    <>
      <AdminHeading title="Email log">Every email the store tried to send. If one failed, the reason is shown so you can fix your email settings.</AdminHeading>
      {!features.email_notifications ? <div className="mb-6"><Alert tone="warn" title="Email is switched off">Set up and verify email in Settings. Until then, the store sends no email at all.</Alert></div> : null}
      {failed > 0 ? <div className="mb-6"><ActionForm action={retryEmailsAction} className="flex flex-wrap items-center gap-3"><SubmitButton pendingLabel="Retrying…">Retry {failed} failed email{failed === 1 ? "" : "s"}</SubmitButton></ActionForm></div> : null}
      {rows.length === 0 ? <EmptyState title="No emails yet" /> : (
        <DataTable caption="Emails">
          <thead><tr><Th>When</Th><Th>To</Th><Th>Subject</Th><Th>Status</Th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><Td className="whitespace-nowrap text-muted">{formatDateTime(r.created_at, settings.timezone)}</Td><Td>{r.to_email}</Td><Td>{r.subject}<div className="text-xs text-muted">{r.template}</div></Td><Td><Badge tone={r.status === "sent" ? "ok" : r.status === "failed" ? "danger" : "warn"}>{r.status}</Badge>{r.last_error ? <div className="mt-1 max-w-xs text-xs text-danger">{r.last_error}</div> : null}</Td></tr>)}</tbody>
        </DataTable>
      )}
    </>
  );
}
