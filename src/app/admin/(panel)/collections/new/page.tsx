import { requireAdmin } from "@/lib/auth";
import { listAdminProducts } from "@/lib/catalog/admin";
import { getStoreSettings } from "@/lib/settings";
import { AdminHeading, Breadcrumb } from "@/components/admin-ui";
import { CollectionForm } from "@/components/collection-form";

export const metadata = { title: "New collection" };

export default async function NewCollectionPage() {
  await requireAdmin("products.manage");
  const [products, settings] = await Promise.all([listAdminProducts({ pageSize: 100 }), getStoreSettings()]);
  return (
    <>
      <Breadcrumb items={[{ href: "/admin/collections", label: "Collections" }, { label: "New" }]} />
      <AdminHeading title="New collection" />
      <CollectionForm initial={{ id: null, title: "", description: "", status: "draft", startsAt: "", endsAt: "", featured: false, productIds: [] }} products={products.items.map((p) => ({ id: p.id, name: p.name, status: p.status }))} timezone={settings.timezone} />
    </>
  );
}
