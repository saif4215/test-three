import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listPromotions } from "@/lib/promotions";
import { getFeatures, getStoreSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/util";
import { AdminHeading, DataTable, Td, Th } from "@/components/admin-ui";
import { ActionButton } from "@/components/admin-forms";
import { Alert, Badge, EmptyState } from "@/components/ui";
import { deletePromotionAction } from "./actions";

export const metadata = { title: "Promotions" };

export default async function PromotionsPage() {
  await requireAdmin("promotions.manage");
  const [list, features, settings] = await Promise.all([listPromotions(), getFeatures(), getStoreSettings()]);
  return (
    <>
      <AdminHeading title="Promotions" actions={<Link href="/admin/promotions/new" className="btn-primary btn-sm">New discount code</Link>}>Discount codes customers can type in the bag or at checkout.</AdminHeading>
      {!features.promotions ? <div className="mb-6"><Alert tone="warn" title="Discount codes are switched off">Customers can’t use these codes until you turn on “Discount codes” in Settings.</Alert></div> : null}
      {list.length === 0 ? (
        <EmptyState title="No discount codes yet" action={<Link href="/admin/promotions/new" className="btn-primary">Create one</Link>}>Only create promotions that have been approved.</EmptyState>
      ) : (
        <DataTable caption="Discount codes">
          <thead><tr><Th>Code</Th><Th>Discount</Th><Th>Window</Th><Th>Used</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <Td><Link href={`/admin/promotions/${p.id}`} className="font-medium underline underline-offset-4">{p.code}</Link></Td>
                <Td>{p.kind === "percent" ? `${p.value}% off` : `${formatMoney(p.value)} off`}{p.min_subtotal_cents ? <span className="text-muted"> · min {formatMoney(p.min_subtotal_cents)}</span> : null}</Td>
                <Td className="text-muted">{p.starts_at || p.ends_at ? `${p.starts_at ? formatDateTime(p.starts_at, settings.timezone) : "Now"} → ${p.ends_at ? formatDateTime(p.ends_at, settings.timezone) : "no end"}` : "Always"}</Td>
                <Td>{p.used_count}{p.max_uses ? ` / ${p.max_uses}` : ""}</Td>
                <Td><Badge tone={p.active ? "ok" : "neutral"}>{p.active ? "active" : "off"}</Badge></Td>
                <Td className="whitespace-nowrap text-right"><Link href={`/admin/promotions/${p.id}`} className="btn-secondary btn-sm">Edit</Link> <ActionButton action={deletePromotionAction} fields={{ id: p.id }} label="Delete" confirm={`Delete the code ${p.code}?`} className="btn-danger btn-sm" /></Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </>
  );
}
