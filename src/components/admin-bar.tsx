import Link from "next/link";
import { can } from "@/lib/permissions";
import type { AdminSession } from "@/lib/auth";

/** A slim strip shown to signed-in staff while they browse the live store, with shortcuts back to the admin. */
export function AdminBar({ admin }: { admin: AdminSession }) {
  return (
    <div className="no-print bg-ink text-white">
      <div className="container-page flex flex-wrap items-center gap-x-5 gap-y-1 py-2 text-sm">
        <span className="font-medium">Signed in as {admin.name || admin.email}</span>
        <Link href="/admin" className="underline-offset-4 hover:underline">
          Dashboard
        </Link>
        {can(admin.role, "orders.view") ? (
          <Link href="/admin/orders" className="underline-offset-4 hover:underline">
            Orders
          </Link>
        ) : null}
        {can(admin.role, "products.view") ? (
          <Link href="/admin/products" className="underline-offset-4 hover:underline">
            Products
          </Link>
        ) : null}
        {can(admin.role, "content.manage") ? (
          <Link href="/admin/content" className="underline-offset-4 hover:underline">
            Edit homepage
          </Link>
        ) : null}
      </div>
    </div>
  );
}
