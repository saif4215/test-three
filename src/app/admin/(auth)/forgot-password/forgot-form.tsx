"use client";

import { ActionForm, SubmitButton } from "@/components/admin-forms";
import { forgotPasswordAction } from "../../actions-auth";

export function ForgotForm() {
  return (
    <ActionForm action={forgotPasswordAction}>
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="field" maxLength={254} />
      </div>
      <SubmitButton className="btn-primary w-full" pendingLabel="Sending…">Send reset link</SubmitButton>
    </ActionForm>
  );
}
