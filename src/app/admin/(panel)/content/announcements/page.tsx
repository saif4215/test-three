import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { getStoreSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/format";
import { AdminHeading, DataTable, Td, Th } from "@/components/admin-ui";
import { ActionButton } from "@/components/admin-forms";
import { Badge, EmptyState } from "@/components/ui";
import { deleteAnnouncementAction } from "../actions";

export const metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  await requireAdmin("content.manage");
  const settings = await getStoreSettings();
  const rows = (await query<{ id: string; title: string; tone: string; starts_at: Date | null; ends_at: Date | null; active: boolean }>("select id, title, tone, starts_at, ends_at, active from announcements order by created_at desc")).rows;
  return (
    <>
      <AdminHeading title="Announcements" actions={<Link href="/admin/content/announcements/new" className="btn-primary btn-sm">New announcement</Link>}>Notices for the top of the site and the homepage. Only post what has been approved.</AdminHeading>
      {rows.length === 0 ? <EmptyState title="No announcements" action={<Link href="/admin/content/announcements/new" className="btn-primary">Write one</Link>}>Nothing is shown to visitors until you add one.</EmptyState> : (
        <DataTable caption="Announcements">
          <thead><tr><Th>Title</Th><Th>Type</Th><Th>Window</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.id}>
              <Td><Link href={`/admin/content/announcements/${a.id}`} className="font-medium underline underline-offset-4">{a.title}</Link></Td>
              <Td><Badge tone={a.tone === "important" ? "danger" : a.tone === "promo" ? "accent" : "neutral"}>{a.tone}</Badge></Td>
              <Td className="text-muted">{a.starts_at || a.ends_at ? `${a.starts_at ? formatDateTime(a.starts_at, settings.timezone) : "Now"} → ${a.ends_at ? formatDateTime(a.ends_at, settings.timezone) : "no end"}` : "Always"}</Td>
              <Td><Badge tone={a.active ? "ok" : "neutral"}>{a.active ? "on" : "off"}</Badge></Td>
              <Td className="whitespace-nowrap text-right"><Link href={`/admin/content/announcements/${a.id}`} className="btn-secondary btn-sm">Edit</Link> <ActionButton action={deleteAnnouncementAction} fields={{ id: a.id }} label="Delete" confirm={`Delete “${a.title}”?`} className="btn-danger btn-sm" /></Td>
            </tr>
          ))}</tbody>
        </DataTable>
      )}
    </>
  );
}
