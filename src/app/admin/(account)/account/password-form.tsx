"use client";

import { ActionForm, SubmitButton } from "@/components/admin-forms";
import { changePasswordAction } from "../../actions-auth";

export function PasswordForm() {
  return (
    <ActionForm action={changePasswordAction}>
      <div><label htmlFor="current" className="label">Current password</label><input id="current" name="current" type="password" required autoComplete="current-password" className="field" maxLength={200} /></div>
      <div><label htmlFor="password" className="label">New password</label><input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" className="field" maxLength={200} /><p className="hint">At least 12 characters. A few random words in a row works well.</p></div>
      <div><label htmlFor="confirm" className="label">Repeat the new password</label><input id="confirm" name="confirm" type="password" required minLength={12} autoComplete="new-password" className="field" maxLength={200} /></div>
      <SubmitButton pendingLabel="Saving…">Change password</SubmitButton>
    </ActionForm>
  );
}
