"use client";

import { ActionForm, SubmitButton } from "@/components/admin-forms";
import { setupAction } from "../../actions-auth";

export function SetupForm() {
  return (
    <ActionForm action={setupAction}>
      <div><label htmlFor="token" className="label">Setup code</label><input id="token" name="token" type="password" required autoComplete="off" className="field" maxLength={200} /></div>
      <div><label htmlFor="name" className="label">Your name</label><input id="name" name="name" autoComplete="name" className="field" maxLength={120} /></div>
      <div><label htmlFor="email" className="label">Email</label><input id="email" name="email" type="email" required autoComplete="email" className="field" maxLength={254} /></div>
      <div><label htmlFor="password" className="label">Password</label><input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" className="field" maxLength={200} /></div>
      <div><label htmlFor="confirm" className="label">Repeat the password</label><input id="confirm" name="confirm" type="password" required minLength={12} autoComplete="new-password" className="field" maxLength={200} /></div>
      <SubmitButton className="btn-primary w-full" pendingLabel="Creating…">Create Owner account</SubmitButton>
    </ActionForm>
  );
}
