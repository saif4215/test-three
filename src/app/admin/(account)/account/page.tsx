import { requireAdmin } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { Alert } from "@/components/ui";
import { PasswordForm } from "./password-form";
import { logoutAction } from "../../actions-auth";

export const metadata = { title: "My account", robots: { index: false } };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const admin = await requireAdmin(undefined, { allowMustChange: true });
  const sp = await searchParams;
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-1 text-3xl font-semibold tracking-tight">My account</h1>
      <p className="mb-6 text-muted">{admin.name || admin.email} · {ROLE_LABELS[admin.role]}</p>
      {admin.mustChangePassword || sp.required ? (
        <div className="mb-6"><Alert tone="warn" title="Choose your own password">Before you continue, replace the temporary password you were given.</Alert></div>
      ) : null}
      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Change password</h2>
        <PasswordForm />
      </section>
      <form action={logoutAction} className="mt-6"><button type="submit" className="btn-secondary">Sign out</button></form>
    </main>
  );
}
