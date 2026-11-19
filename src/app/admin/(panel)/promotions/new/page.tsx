import { requireAdmin } from "@/lib/auth";
import { getStoreSettings } from "@/lib/settings";
import { AdminHeading, Breadcrumb } from "@/components/admin-ui";
import { PromotionForm } from "@/components/promotion-form";

export const metadata = { title: "New discount code" };

export default async function NewPromotionPage() {
  await requireAdmin("promotions.manage");
  const settings = await getStoreSettings();
  return (
    <>
      <Breadcrumb items={[{ href: "/admin/promotions", label: "Promotions" }, { label: "New" }]} />
      <AdminHeading title="New discount code" />
      <PromotionForm timezone={settings.timezone} />
    </>
  );
}
