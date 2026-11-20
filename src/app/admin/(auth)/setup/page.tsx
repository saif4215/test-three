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
      <p className="mb-6 text-sm text-muted">Enter the setup token from the server’s ADMIN_SETUP_TOKEN setting. This page closes itself as soon as the first Owner exists.</p>
      <SetupForm />
      <p className="mt-4 text-center text-sm"><Link href="/admin/login" className="underline underline-offset-4">Back to sign in</Link></p>
    </>
  );
}
