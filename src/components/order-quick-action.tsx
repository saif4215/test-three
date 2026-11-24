"use client";

import { changeStatusAction } from "@/app/admin/(panel)/orders/actions";
import { ActionForm, SubmitButton } from "./admin-forms";

/** The one obvious next step for an order, right in the list (Confirm, then Mark ready, then Mark completed). */
export function OrderQuickAction({ id, to, label }: { id: string; to: string; label: string }) {
  return (
    <ActionForm action={changeStatusAction} className="space-y-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      <SubmitButton className="btn-secondary btn-sm whitespace-nowrap" pendingLabel="Working…">
        {label}
      </SubmitButton>
    </ActionForm>
  );
}
