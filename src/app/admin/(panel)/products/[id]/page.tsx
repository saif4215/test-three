import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getAdminProduct, listAdminCategories } from "@/lib/catalog/admin";
import { isUuid } from "@/lib/util";
import { AdminHeading, Breadcrumb } from "@/components/admin-ui";
import { Alert } from "@/components/ui";
import { ProductEditor, type EditorInitial } from "@/components/product-editor";

export const metadata = { title: "Edit product" };

const dollars = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; copied?: string }> }) {
  await requireAdmin("products.manage");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const [p, cats] = await Promise.all([getAdminProduct(id), listAdminCategories()]);
  if (!p) notFound();
  const initial: EditorInitial = {
    id: p.id, name: p.name, shortDescription: p.short_description, description: p.description_md, instructions: p.instructions_md, sizeChart: p.size_chart_md, status: p.status,
    price: dollars(p.price_cents), salePrice: dollars(p.sale_price_cents), sku: p.sku, tags: p.tags.join(", "), featured: p.featured, trackInventory: p.track_inventory,
    lowStockThreshold: p.low_stock_threshold === null ? "" : String(p.low_stock_threshold), categoryIds: p.category_ids,
    images: p.images.map((i) => ({ assetId: i.asset_id, alt: i.alt, color: i.color, storageKey: i.storage_key, widths: i.widths })),
    variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, size: v.size, color: v.color, price: dollars(v.price_cents), stock: String(v.stock), threshold: v.low_stock_threshold === null ? "" : String(v.low_stock_threshold), active: v.active })),
  };
  return (
    <>
      <Breadcrumb items={[{ href: "/admin/products", label: "Products" }, { label: p.name }]} />
      <AdminHeading title={p.name} actions={<Link href={`/products/${p.slug}?preview=1`} target="_blank" className="btn-secondary btn-sm">Preview in store ↗</Link>}>
        {p.status === "published" ? "This product is live in the store." : p.status === "draft" ? "This is a draft: customers can’t see it yet." : "This product is archived and hidden."}
      </AdminHeading>
      {sp.copied ? <div className="mb-6"><Alert tone="ok">Copy created as a draft. Update its name, photos and stock, then publish.</Alert></div> : null}
      <ProductEditor key={`${p.id}-${p.variants.map((v) => v.id).join("")}-${p.images.length}`} initial={initial} categories={cats.map((c) => ({ id: c.id, name: c.name }))} saved={sp.saved} />
    </>
  );
}
