import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listAdminCategories, listAdminProducts } from "@/lib/catalog/admin";
import { mediaUrl } from "@/lib/media-url";
import { formatMoney } from "@/lib/util";
import { formatDate } from "@/lib/format";
import { getStoreSettings } from "@/lib/settings";
import { AdminHeading, DataTable, Td, Th } from "@/components/admin-ui";
import { ActionButton } from "@/components/admin-forms";
import { Badge, EmptyState, Pagination } from "@/components/ui";
import { deleteProductAction, duplicateProductAction, setStatusAction } from "./actions";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; category?: string; stock?: string; page?: string }> }) {
  const admin = await requireAdmin("products.view");
  const sp = await searchParams;
  const canManage = can(admin.role, "products.manage");
  const [list, cats, settings] = await Promise.all([listAdminProducts({ q: sp.q, status: sp.status, category: sp.category, stock: sp.stock, page: Number(sp.page) || 1 }), listAdminCategories(), getStoreSettings()]);
  const filtered = !!(sp.q || sp.status || sp.category || sp.stock);
  const q = { q: sp.q, status: sp.status, category: sp.category, stock: sp.stock };
  return (
    <>
      <AdminHeading
        title="Products"
        actions={
          canManage ? (
            <>
              <Link href="/admin/products/import" className="btn-secondary btn-sm">Import from spreadsheet</Link>
              <Link href="/admin/products/new" className="btn-primary btn-sm">Add product</Link>
            </>
          ) : undefined
        }
      >
        Add, edit and publish merchandise. Only published products appear in the store.
      </AdminHeading>

      <form method="get" className="card mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto] lg:items-end">
        <div><label htmlFor="q" className="label">Search</label><input id="q" name="q" defaultValue={sp.q} className="field" placeholder="Name or SKU" /></div>
        <div><label htmlFor="status" className="label">Status</label><select id="status" name="status" defaultValue={sp.status ?? ""} className="field"><option value="">All</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></div>
        <div><label htmlFor="category" className="label">Category</label><select id="category" name="category" defaultValue={sp.category ?? ""} className="field"><option value="">All</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label htmlFor="stock" className="label">Stock</label><select id="stock" name="stock" defaultValue={sp.stock ?? ""} className="field"><option value="">Any</option><option value="low">Low</option><option value="out">Out of stock</option></select></div>
        <div className="flex gap-2"><button type="submit" className="btn-primary">Filter</button><Link href="/admin/products" className="btn-secondary">Reset</Link></div>
      </form>

      {list.items.length === 0 ? (
        <EmptyState
          title={filtered ? "No products match" : "No products yet"}
          action={canManage && !filtered ? <div className="flex flex-wrap justify-center gap-2"><Link href="/admin/products/new" className="btn-primary">Add your first product</Link><Link href="/admin/products/import" className="btn-secondary">Import from a spreadsheet</Link></div> : undefined}
        >
          Products you add appear here.
        </EmptyState>
      ) : (
        <DataTable caption="Products">
          <thead><tr><Th>Product</Th><Th>Status</Th><Th>Price</Th><Th>Stock</Th><Th>Updated</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>
            {list.items.map((p) => (
              <tr key={p.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    {p.image ? <img src={mediaUrl(p.image, 200)} alt="" className="size-12 bg-soft object-cover" loading="lazy" /> : <div className="grid size-12 place-items-center bg-soft text-[10px] text-muted">No photo</div>}
                    <div className="min-w-0">
                      <Link href={`/admin/products/${p.id}`} className="font-medium underline underline-offset-4">{p.name}</Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted">{p.featured ? <Badge tone="accent">Featured</Badge> : null}{p.is_demo ? <Badge tone="neutral">Sample</Badge> : null}<span>{p.variant_count} option{p.variant_count === 1 ? "" : "s"}</span></div>
                    </div>
                  </div>
                </Td>
                <Td><Badge tone={p.status === "published" ? "ok" : p.status === "draft" ? "warn" : "neutral"}>{p.status}</Badge></Td>
                <Td>{p.sale_price_cents !== null ? <><span className="font-medium text-ok">{formatMoney(p.sale_price_cents)}</span> <s className="text-xs text-muted">{formatMoney(p.price_cents)}</s></> : formatMoney(p.price_cents)}</Td>
                <Td>{!p.track_inventory ? <span className="text-muted">Not tracked</span> : p.out_of_stock ? <Badge tone="danger">Out of stock</Badge> : p.low_stock ? <Badge tone="warn">Low · {p.total_stock}</Badge> : p.total_stock}</Td>
                <Td className="whitespace-nowrap text-muted">{formatDate(p.updated_at, settings.timezone)}</Td>
                <Td className="whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`/admin/products/${p.id}`} className="btn-secondary btn-sm">Edit</Link>
                    <Link href={`/products/${p.slug}?preview=1`} target="_blank" className="btn-secondary btn-sm">Preview</Link>
                    {canManage && p.status !== "published" && p.status !== "archived" ? <ActionButton action={setStatusAction} fields={{ id: p.id, status: "published" }} label="Publish" confirm="Publish this product so customers can see it?" className="btn-primary btn-sm" /> : null}
                    {canManage ? (
                      <details className="group relative">
                        <summary className="btn-ghost btn-sm cursor-pointer list-none">More <span aria-hidden="true" className="transition group-open:rotate-180">⌄</span><span className="sr-only"> actions for {p.name}</span></summary>
                        <div className="absolute right-0 z-10 mt-1 flex w-44 flex-col items-stretch gap-1 rounded-xl border border-line bg-white p-2 shadow-lg [&_button]:w-full">
                          {p.status === "published" ? <ActionButton action={setStatusAction} fields={{ id: p.id, status: "draft" }} label="Unpublish" confirm="Hide this product from the store?" /> : null}
                          {p.status === "archived" ? <ActionButton action={setStatusAction} fields={{ id: p.id, status: "published" }} label="Publish" confirm="Publish this product so customers can see it?" /> : null}
                          <ActionButton action={duplicateProductAction} fields={{ id: p.id }} label="Duplicate" />
                          {p.status !== "archived" ? <ActionButton action={setStatusAction} fields={{ id: p.id, status: "archived" }} label="Archive" confirm="Archive this product? It will be hidden from the store." /> : null}
                          <ActionButton action={deleteProductAction} fields={{ id: p.id }} label="Delete" confirm="Delete this product permanently? This cannot be undone." className="btn-danger btn-sm" />
                        </div>
                      </details>
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <Pagination page={list.page} pageCount={list.pageCount} basePath="/admin/products" query={q} />
    </>
  );
}
