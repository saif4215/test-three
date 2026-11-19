import { requireAdmin } from "@/lib/auth";
import { getStoreSettings } from "@/lib/settings";
import { AdminHeading, Breadcrumb } from "@/components/admin-ui";
import { AnnouncementForm } from "@/components/announcement-form";

export const metadata = { title: "New announcement" };

export default async function NewAnnouncementPage() {
  await requireAdmin("content.manage");
  const settings = await getStoreSettings();
  return (
    <>
      <Breadcrumb items={[{ href: "/admin/content/announcements", label: "Announcements" }, { label: "New" }]} />
      <AdminHeading title="New announcement" />
      <AnnouncementForm timezone={settings.timezone} />
    </>
  );
}
