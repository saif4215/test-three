"use client";

import { useActionState } from "react";
import { requestRestockAction } from "@/app/actions/restock";
import type { ActionState } from "@/lib/action-state";

export function RestockForm({ variantId }: { variantId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestRestockAction, {});
  if (state.ok) {
    return (
      <p role="status" className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-line p-5">
      <p className="font-medium">Email me when it’s back</p>
      <input type="hidden" name="variantId" value={variantId} />
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div>
        <label htmlFor="restock-email" className="label">
          Email address
        </label>
        <input id="restock-email" name="email" type="email" required autoComplete="email" className="field" maxLength={254} />
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="consent" required className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" />
        <span>I agree to receive one email when this item is back in stock. I can unsubscribe at any time.</span>
      </label>
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn-secondary">
        {pending ? "Saving…" : "Notify me"}
      </button>
    </form>
  );
}
