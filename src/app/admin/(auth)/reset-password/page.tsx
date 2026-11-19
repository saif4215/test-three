import Link from "next/link";
import { isResetTokenValid } from "@/lib/password-reset";
import { Alert } from "@/components/ui";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const valid = token.length >= 20 && (await isResetTokenValid(token));
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Choose a new password</h1>
      {valid ? (
        <>
          <p className="mb-6 text-sm text-muted">At least 12 characters. A few random words in a row works well.</p>
          <ResetForm token={token} />
        </>
      ) : (
        <div className="mt-4 space-y-4">
          <Alert tone="warn" title="This link has expired or was already used">Request a new one and try again.</Alert>
          <Link href="/admin/forgot-password" className="btn-primary w-full">Request a new link</Link>
        </div>
      )}
    </>
  );
}
