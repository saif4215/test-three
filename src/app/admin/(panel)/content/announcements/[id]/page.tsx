import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { getStoreSettings } from "@/lib/settings";
import { isUuid } from "@/lib/util";
import { AdminHeading, Breadcrumb } from "@/components/admin-ui";
import { Alert } from "@/components/ui";
import { AnnouncementForm, type AnnouncementRow } from "@/components/announcement-form";

export const metadata = { title: "Edit announcement" };

export default async function EditAnnouncementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin("content.manage");
  const [{ id }, sp, settings] = await Promise.all([params, searchParams, getStoreSettings()]);
  if (!isUuid(id)) notFound();
  const a = (await query<AnnouncementRow>("select id, title, body_md, tone, link_url, link_label, starts_at, ends_at, active from announcements where id = $1", [id])).rows[0];
  if (!a) notFound();
  return (
    <>
      <Breadcrumb items={[{ href: "/admin/content/announcements", label: "Announcements" }, { label: a.title }]} />
      <AdminHeading title={a.title} />
      {sp.saved ? <div className="mb-6"><Alert tone="ok">Saved.</Alert></div> : null}
      <AnnouncementForm a={a} timezone={settings.timezone} />
    </>
  );
}
