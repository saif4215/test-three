import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { countAdmins } from "@/lib/admins";
import { SetupForm } from "./setup-form";

/** Exists only while the server has a setup token AND no administrator exists yet. Afterwards it is a plain 404. */
export default async function SetupPage() {
  if (!env.adminSetupToken || (await countAdmins()) > 0) notFound();
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Create the first Owner</h1>
      <p className="mb-4 text-sm text-muted">Choose your name, email and a password. The Owner can do everything, including adding the rest of the team. This page closes itself as soon as the Owner exists.</p>
      <details className="mb-6 rounded-xl border border-line bg-soft px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">Where do I find the setup code?</summary>
        <p className="mt-2 text-muted">
          It’s the <code className="rounded bg-white px-1">ADMIN_SETUP_TOKEN</code> setting on your server. On Render: open the service, choose <strong className="text-ink">Environment</strong>, then click the eye next to
          ADMIN_SETUP_TOKEN to show it. Copy it into the first box below.
        </p>
      </details>
      <SetupForm />
      <p className="mt-4 text-center text-sm"><Link href="/admin/login" className="underline underline-offset-4">Back to sign in</Link></p>
    </>
  );
}
