import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { can, ROLE_LABELS, type Permission } from "@/lib/permissions";
import { getStoreSettings } from "@/lib/settings";
import { orderStatusCounts } from "@/lib/orders/queries";
import { AdminMobileNav, AdminSidebar, type NavGroup } from "@/components/admin-nav";
import { logoutAction } from "../actions-auth";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin" }, robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const settings = await getStoreSettings();
  const counts = can(admin.role, "orders.view") ? await orderStatusCounts() : {};
  const pending = (counts.pending ?? 0) + (counts.awaiting_payment ?? 0);
  const item = (href: string, label: string, perm: Permission, badge?: number) => (can(admin.role, perm) ? [{ href, label, badge }] : []);
  const groups: NavGroup[] = [
    { title: "Overview", items: [{ href: "/admin", label: "Dashboard" }] },
    { title: "Catalog", items: [...item("/admin/products", "Products", "products.view"), ...item("/admin/categories", "Categories", "products.manage"), ...item("/admin/collections", "Collections", "products.manage"), ...item("/admin/inventory", "Inventory", "products.view")] },
    { title: "Sales", items: [...item("/admin/orders", "Orders", "orders.view", pending), ...item("/admin/promotions", "Promotions", "promotions.manage"), ...item("/admin/analytics", "Analytics", "analytics.view")] },
    { title: "Website", items: [...item("/admin/content", "Homepage & content", "content.manage"), ...item("/admin/content/announcements", "Announcements", "content.manage"), ...item("/admin/content/pages", "Policy pages", "content.manage")] },
    { title: "Tools", items: [...item("/admin/ai", "Writing assistant", "ai.use")] },
    { title: "Administration", items: [...item("/admin/settings", "Settings", "settings.manage"), ...item("/admin/team", "Team", "team.manage"), ...item("/admin/emails", "Email log", "settings.manage"), ...item("/admin/audit", "Activity log", "audit.view")] },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-dvh flex-col bg-soft">
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <AdminMobileNav groups={groups} />
            <Link href="/admin" className="text-xl font-extrabold tracking-[-0.04em]">
              {settings.storeName} <span className="text-sm font-normal tracking-normal text-muted">admin</span>
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/" target="_blank" className="hidden underline underline-offset-4 sm:inline">
              View store ↗
            </Link>
            <Link href="/admin/account" className="hidden text-right leading-tight sm:block">
              <span className="block font-medium">{admin.name || admin.email}</span>
              <span className="block text-xs text-muted">{ROLE_LABELS[admin.role]}</span>
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="btn-secondary btn-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        <AdminSidebar groups={groups} />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 p-4 sm:p-6 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}
