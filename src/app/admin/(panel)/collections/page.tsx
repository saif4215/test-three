import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listAdminCollections } from "@/lib/catalog/collections";
import { getStoreSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/format";
import { AdminHeading, DataTable, Td, Th } from "@/components/admin-ui";
import { ActionButton } from "@/components/admin-forms";
import { Badge, EmptyState } from "@/components/ui";
import { deleteCollectionAction } from "./actions";

export const metadata = { title: "Collections" };

export default async function CollectionsPage() {
  await requireAdmin("products.manage");
  const [list, settings] = await Promise.all([listAdminCollections(), getStoreSettings()]);
  return (
    <>
      <AdminHeading title="Collections" actions={<Link href="/admin/collections/new" className="btn-primary btn-sm">New collection</Link>}>
        Limited-edition and seasonal groupings. Add one for a spirit week, a drop or a holiday.
      </AdminHeading>
      {list.length === 0 ? (
        <EmptyState title="No collections yet" action={<Link href="/admin/collections/new" className="btn-primary">Create a collection</Link>}>A collection groups products and can appear on a schedule.</EmptyState>
      ) : (
        <DataTable caption="Collections">
          <thead><tr><Th>Collection</Th><Th>Status</Th><Th>Schedule</Th><Th>Products</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <Td><Link href={`/admin/collections/${c.id}`} className="font-medium underline underline-offset-4">{c.title}</Link>{c.featured ? <> <Badge tone="accent">Featured</Badge></> : null}</Td>
                <Td><Badge tone={c.status === "published" ? "ok" : "warn"}>{c.status}</Badge></Td>
                <Td className="text-muted">{c.starts_at || c.ends_at ? `${c.starts_at ? formatDateTime(c.starts_at, settings.timezone) : "Any time"} → ${c.ends_at ? formatDateTime(c.ends_at, settings.timezone) : "no end"}` : "Always"}</Td>
                <Td>{c.product_count}</Td>
                <Td className="whitespace-nowrap text-right"><Link href={`/admin/collections/${c.id}`} className="btn-secondary btn-sm">Edit</Link> <ActionButton action={deleteCollectionAction} fields={{ id: c.id }} label="Delete" confirm={`Delete “${c.title}”? The products stay.`} className="btn-danger btn-sm" /></Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </>
  );
}
