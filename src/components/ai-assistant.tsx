"use client";

import { useActionState, useState } from "react";
import { draftAction } from "@/app/admin/(panel)/ai/actions";
import type { ActionState } from "@/lib/action-state";
import { FormMessage } from "./admin-forms";

interface Option {
  key: string;
  label: string;
  hint: string;
}

export function AiAssistant({ tasks, tones }: { tasks: Option[]; tones: { key: string; label: string }[] }) {
  const [state, action, pending] = useActionState(draftAction, {} as ActionState);
  const [task, setTask] = useState(tasks[0].key);
  const [copied, setCopied] = useState(false);
  const text = typeof state.data?.text === "string" ? state.data.text : "";
  const current = tasks.find((t) => t.key === task) ?? tasks[0];

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form action={action} className="space-y-4" aria-busy={pending}>
        <div>
          <label htmlFor="task" className="label">What do you need?</label>
          <select id="task" name="task" value={task} onChange={(e) => setTask(e.target.value)} className="field">
            {tasks.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tone" className="label">Tone</label>
          <select id="tone" name="tone" defaultValue="friendly" className="field">
            {tones.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="notes" className="label">Facts and text to work from</label>
          <textarea id="notes" name="notes" required minLength={3} maxLength={4000} rows={9} className="field" aria-describedby="notes-hint" />
          <p id="notes-hint" className="hint">{current.hint} Only what you type here is sent. Don’t include customer names, emails, phone numbers or order numbers.</p>
        </div>
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Writing…" : "Write a draft"}</button>
        {state.error ? <FormMessage state={{ error: state.error }} /> : null}
      </form>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Draft</h2>
        {text ? (
          <div className="space-y-3">
            <p role="status" className="text-sm font-medium text-warn">AI draft: check every fact, price and date before you use it.</p>
            <textarea readOnly aria-label="AI draft" value={text} rows={12} className="field" />
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2500);
                } catch {
                  /* the text can still be selected by hand */
                }
              }}
            >
              {copied ? "Copied" : "Copy draft"}
            </button>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-line-strong p-6 text-sm text-muted">Your draft will appear here. Nothing is saved or published automatically.</p>
        )}
      </div>
    </div>
  );
}
