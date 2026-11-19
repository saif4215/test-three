import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getPromotion } from "@/lib/promotions";
import { getStoreSettings } from "@/lib/settings";
import { isUuid } from "@/lib/util";
import { AdminHeading, Breadcrumb } from "@/components/admin-ui";
import { Alert } from "@/components/ui";
import { PromotionForm } from "@/components/promotion-form";

export const metadata = { title: "Edit discount code" };

export default async function EditPromotionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin("promotions.manage");
  const [{ id }, sp, settings] = await Promise.all([params, searchParams, getStoreSettings()]);
  if (!isUuid(id)) notFound();
  const promo = await getPromotion(id);
  if (!promo) notFound();
  return (
    <>
      <Breadcrumb items={[{ href: "/admin/promotions", label: "Promotions" }, { label: promo.code }]} />
      <AdminHeading title={promo.code} />
      {sp.saved ? <div className="mb-6"><Alert tone="ok">Saved.</Alert></div> : null}
      <PromotionForm promo={promo} timezone={settings.timezone} />
    </>
  );
}
