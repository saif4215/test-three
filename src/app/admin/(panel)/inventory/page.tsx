import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listInventory } from "@/lib/catalog/admin";
import { getStoreSettings } from "@/lib/settings";
import { AdminHeading, DataTable, Td, Th, DownloadLink } from "@/components/admin-ui";
import { ActionForm, SubmitButton } from "@/components/admin-forms";
import { Badge, EmptyState } from "@/components/ui";
import { setStockAction } from "../products/actions";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; low?: string }> }) {
  const admin = await requireAdmin("products.view");
  const sp = await searchParams;
  const settings = await getStoreSettings();
  const rows = await listInventory({ q: sp.q, low: sp.low === "1", defaultThreshold: settings.lowStockDefault });
  const canEdit = can(admin.role, "inventory.adjust");
  return (
    <>
      <AdminHeading title="Inventory" actions={<DownloadLink href="/api/admin/export/inventory">Download CSV</DownloadLink>}>Every size and colour with its stock. Change a number and press Save on that row.</AdminHeading>
      <form method="get" className="card mb-6 flex flex-wrap items-end gap-4 p-5">
        <div className="min-w-[14rem] flex-1"><label htmlFor="q" className="label">Search</label><input id="q" name="q" defaultValue={sp.q} className="field" placeholder="Product, size, colour or SKU" /></div>
        <label className="flex items-center gap-2 pb-3"><input type="checkbox" name="low" value="1" defaultChecked={sp.low === "1"} className="size-5 accent-[var(--brand)]" /> Low or out of stock only</label>
        <div className="flex gap-2"><button type="submit" className="btn-primary">Filter</button><Link href="/admin/inventory" className="btn-secondary">Reset</Link></div>
      </form>
      {rows.length === 0 ? <EmptyState title="Nothing to show">Add products to see their stock here.</EmptyState> : (
        <DataTable caption="Inventory">
          <thead><tr><Th>Product</Th><Th>Option</Th><Th>SKU</Th><Th>Stock</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.variant_id}>
                <Td><Link href={`/admin/products/${r.product_id}`} className="font-medium underline underline-offset-4">{r.product_name}</Link> {r.product_status !== "published" ? <Badge>{r.product_status}</Badge> : null}</Td>
                <Td>{[r.size, r.color].filter(Boolean).join(" / ") || "—"}{!r.active ? " (inactive)" : ""}</Td>
                <Td className="text-muted">{r.sku || "—"}</Td>
                <Td>
                  {canEdit && r.track_inventory ? (
                    <ActionForm action={setStockAction} className="flex items-center gap-2">
                      <input type="hidden" name="variantId" value={r.variant_id} />
                      <label className="sr-only" htmlFor={`st-${r.variant_id}`}>Stock for {r.product_name} {[r.size, r.color].filter(Boolean).join(" ")}</label>
                      <input id={`st-${r.variant_id}`} name="stock" defaultValue={r.stock} inputMode="numeric" className="field !min-h-9 !w-24 !py-1 !text-sm" />
                      <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">Save</SubmitButton>
                      {r.stock === 0 ? <Badge tone="danger">Out</Badge> : r.stock <= r.threshold ? <Badge tone="warn">Low</Badge> : null}
                    </ActionForm>
                  ) : (
                    <span>{r.track_inventory ? r.stock : "Not tracked"}</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </>
  );
}
