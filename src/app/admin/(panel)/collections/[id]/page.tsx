import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getAdminCollection } from "@/lib/catalog/collections";
import { listAdminProducts } from "@/lib/catalog/admin";
import { getStoreSettings } from "@/lib/settings";
import { toLocalInput } from "@/lib/format";
import { isUuid } from "@/lib/util";
import { AdminHeading, Breadcrumb } from "@/components/admin-ui";
import { Alert } from "@/components/ui";
import { CollectionForm } from "@/components/collection-form";

export const metadata = { title: "Edit collection" };

export default async function EditCollectionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin("products.manage");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const [c, products, settings] = await Promise.all([getAdminCollection(id), listAdminProducts({ pageSize: 100 }), getStoreSettings()]);
  if (!c) notFound();
  return (
    <>
      <Breadcrumb items={[{ href: "/admin/collections", label: "Collections" }, { label: c.title }]} />
      <AdminHeading title={c.title} />
      {sp.saved ? <div className="mb-6"><Alert tone="ok">Saved.</Alert></div> : null}
      <CollectionForm key={c.id + c.product_ids.join("")} initial={{ id: c.id, title: c.title, description: c.description, status: c.status, startsAt: toLocalInput(c.starts_at, settings.timezone), endsAt: toLocalInput(c.ends_at, settings.timezone), featured: c.featured, productIds: c.product_ids }} products={products.items.map((p) => ({ id: p.id, name: p.name, status: p.status }))} timezone={settings.timezone} />
    </>
  );
}
