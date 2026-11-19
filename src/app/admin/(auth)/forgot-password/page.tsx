import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Forgot your password?</h1>
      <p className="mb-6 text-sm text-muted">Enter your email. If it belongs to a team member (and email is set up), we’ll send a reset link that works once.</p>
      <ForgotForm />
      <p className="mt-4 text-center text-sm"><Link href="/admin/login" className="underline underline-offset-4">Back to sign in</Link></p>
    </>
  );
}
