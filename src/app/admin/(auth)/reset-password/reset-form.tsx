"use client";

import { ActionForm, SubmitButton } from "@/components/admin-forms";
import { resetPasswordAction } from "../../actions-auth";

export function ResetForm({ token }: { token: string }) {
  return (
    <ActionForm action={resetPasswordAction}>
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className="label">New password</label>
        <input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" className="field" maxLength={200} />
      </div>
      <div>
        <label htmlFor="confirm" className="label">Repeat the new password</label>
        <input id="confirm" name="confirm" type="password" required minLength={12} autoComplete="new-password" className="field" maxLength={200} />
      </div>
      <SubmitButton className="btn-primary w-full" pendingLabel="Saving…">Save new password</SubmitButton>
    </ActionForm>
  );
}
