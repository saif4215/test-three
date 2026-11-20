"use client";

import { useActionState } from "react";
import { loginAction } from "../../actions-auth";
import { FormMessage } from "@/components/admin-forms";
import type { ActionState } from "@/lib/action-state";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4" aria-busy={pending}>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" required autoComplete="username" className="field" maxLength={254} />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="field" maxLength={200} />
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="btn-primary w-full">{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
