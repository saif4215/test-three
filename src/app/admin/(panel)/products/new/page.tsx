import { requireAdmin } from "@/lib/auth";
import { listAdminCategories } from "@/lib/catalog/admin";
import { AdminHeading, Breadcrumb } from "@/components/admin-ui";
import { ProductEditor, type EditorInitial } from "@/components/product-editor";

export const metadata = { title: "Add product" };

const EMPTY: EditorInitial = {
  id: null, name: "", shortDescription: "", description: "", instructions: "", sizeChart: "", status: "draft", price: "", salePrice: "", sku: "", tags: "", featured: false, trackInventory: true, lowStockThreshold: "",
  categoryIds: [], images: [], variants: [{ id: null, sku: "", size: "", color: "", price: "", stock: "0", threshold: "", active: true }],
};

export default async function NewProductPage() {
  await requireAdmin("products.manage");
  const cats = await listAdminCategories();
  return (
    <>
      <Breadcrumb items={[{ href: "/admin/products", label: "Products" }, { label: "New product" }]} />
      <AdminHeading title="Add product">Start with the basics. You can save it as a draft and publish it when it’s ready.</AdminHeading>
      <ProductEditor initial={EMPTY} categories={cats.map((c) => ({ id: c.id, name: c.name }))} />
    </>
  );
}
