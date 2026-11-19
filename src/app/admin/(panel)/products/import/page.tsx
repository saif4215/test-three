import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { IMPORT_COLUMNS } from "@/lib/catalog/import";
import { AdminHeading, Breadcrumb, DownloadLink } from "@/components/admin-ui";
import { ImportForm } from "@/components/import-form";

export const metadata = { title: "Import products" };

export default async function ImportPage() {
  await requireAdmin("products.manage");
  return (
    <>
      <Breadcrumb items={[{ href: "/admin/products", label: "Products" }, { label: "Import" }]} />
      <AdminHeading title="Import products" actions={<DownloadLink href="/api/admin/export/product-template">Download template (CSV)</DownloadLink>}>
        Add many items at once from a spreadsheet. We check the whole file first: nothing is saved until every line is correct, and everything arrives as a draft.
      </AdminHeading>
      <div className="card mb-6 p-6 text-sm">
        <p className="font-medium">Columns (first row):</p>
        <p className="mt-1 font-mono text-xs">{IMPORT_COLUMNS.join(", ")}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
          <li>Only <strong>name</strong> and <strong>price</strong> are required. Use one row per size/colour; repeat the name on each row.</li>
          <li>Separate several categories or tags with | (a vertical bar).</li>
          <li>Prices are in dollars (20 or 19.99). Stock is a whole number.</li>
        </ul>
        <p className="mt-3">Excel or Google Sheets: <em>File → Download → CSV</em>, then choose the file below. <Link href="/admin/products" className="underline underline-offset-4">Back to products</Link></p>
      </div>
      <ImportForm />
    </>
  );
}
