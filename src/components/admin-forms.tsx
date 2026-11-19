"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ActionState } from "@/lib/action-state";
import { Icon } from "./icons";

/** Shows the result of a form action: a green note when it worked, a red alert when it didn't. */
export function FormMessage({ state }: { state: ActionState }) {
  if (state.error)
    return (
      <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
        {state.error}
      </p>
    );
  if (state.ok && state.message)
    return (
      <p role="status" className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm font-medium text-green-900">
        {state.message}
      </p>
    );
  return null;
}

export function SubmitButton({ children, pendingLabel = "Saving…", className = "btn-primary", disabled = false, name, value }: { children: React.ReactNode; pendingLabel?: string; className?: string; disabled?: boolean; name?: string; value?: string }) {
  // ActionForm flips the idle/busy labels while the action runs.
  return (
    <button type="submit" name={name} value={value} className={className} disabled={disabled} data-submit data-disabled={disabled ? "1" : undefined}>
      <span data-idle>{children}</span>
      <span data-busy hidden>
        {pendingLabel}
      </span>
    </button>
  );
}

/**
 * A form that calls a server action and shows its result right under the fields. `children` may include <SubmitButton>.
 * `resetOnSuccess` clears the fields after a successful save (for "add" forms).
 */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
  resetOnSuccess = false,
  onSuccess,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (state: ActionState) => void;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  const ref = useRef<HTMLFormElement>(null);
  const seen = useRef<ActionState | null>(null);

  useEffect(() => {
    if (state.ok && seen.current !== state) {
      seen.current = state;
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
  }, [state, resetOnSuccess, onSuccess]);

  // Swap the submit button's label while the action runs (works for any <SubmitButton> inside).
  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    f.querySelectorAll<HTMLButtonElement>("button[data-submit]").forEach((b) => {
      b.disabled = pending || b.dataset.disabled === "1";
      b.querySelector<HTMLElement>("[data-idle]")!.hidden = pending;
      b.querySelector<HTMLElement>("[data-busy]")!.hidden = !pending;
    });
  }, [pending]);

  return (
    <form ref={ref} action={formAction} className={className} aria-busy={pending}>
      {children}
      <FormMessage state={state} />
    </form>
  );
}

/** A single-button form for row actions (publish, delete, ...). Asks for confirmation first when `confirm` is set. */
export function ActionButton({
  action,
  fields,
  label,
  confirm,
  className = "btn-secondary btn-sm",
  pendingLabel,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  confirm?: string;
  className?: string;
  pendingLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  const [dismissed, setDismissed] = useState<ActionState | null>(null);
  const shown = !!(state.error || state.message) && dismissed !== state;
  useEffect(() => {
    if (!state.error && !state.message) return;
    const t = window.setTimeout(() => setDismissed(state), 6000);
    return () => window.clearTimeout(t);
  }, [state]);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="inline"
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" className={className} disabled={pending}>
        {pending ? (pendingLabel ?? "Working…") : label}
      </button>
      {shown && state.error ? (
        <span role="alert" className="ml-2 text-sm font-medium text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/** Upload one picture and keep its id in a hidden field so the form that contains it can save it. */
export function ImagePicker({
  name,
  initialAssetId,
  initialUrl,
  label,
  hint,
  kind = "upload",
}: {
  name: string;
  initialAssetId: string | null;
  initialUrl: string | null;
  label: string;
  hint?: string;
  kind?: "upload" | "banner" | "logo";
}) {
  const [assetId, setAssetId] = useState<string | null>(initialAssetId);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = `img-${name.replace(/\W+/g, "-")}`;

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      const res = await fetch("/api/admin/uploads", { method: "POST", body: fd });
      const body = (await res.json()) as { id?: string; url?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? "The upload failed.");
      setAssetId(body.id);
      setUrl(body.url ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <p className="label" id={`${id}-label`}>
        {label}
      </p>
      <input type="hidden" name={name} value={assetId ?? ""} />
      <div className="flex items-center gap-4">
        <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-soft text-xs text-muted">{url ? <img src={url} alt="" className="size-full object-cover" /> : "No image"}</div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <label htmlFor={id} className="btn-secondary btn-sm cursor-pointer">
              {busy ? "Uploading…" : url ? "Replace image" : "Choose image"}
            </label>
            {assetId ? (
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  setAssetId(null);
                  setUrl(null);
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
          <input id={id} ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" aria-describedby={hint ? `${id}-hint` : undefined} onChange={(e) => pick(e.target.files?.[0])} />
          {hint ? (
            <p className="hint" id={`${id}-hint`}>
              {hint}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Toggle({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 size-5 shrink-0 accent-[var(--brand)]" />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="block text-sm text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary no-print">
      <Icon name="grid" size={18} />
      {label}
    </button>
  );
}
