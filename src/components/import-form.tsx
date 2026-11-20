"use client";

import { useActionState, useState } from "react";
import { importCheckAction, importRunAction, type ImportCheckData } from "@/app/admin/(panel)/products/actions";
import type { ActionState } from "@/lib/action-state";
import { FormMessage } from "./admin-forms";

export function ImportForm() {
  const [text, setText] = useState("");
  const [check, checkAction, checking] = useActionState<ActionState, FormData>(importCheckAction, {});
  const [run, runAction, running] = useActionState<ActionState, FormData>(importRunAction, {});
  const data = check.data as unknown as ImportCheckData | undefined;
  // Only a file that was checked AND hasn't been edited since may be imported.
  const norm = (s: string) => s.replace(/\r\n?/g, "\n");
  const ready = !!data && data.problems.length === 0 && data.products > 0 && norm(data.checkedText) === norm(text);
  const stale = !!data && norm(data.checkedText) !== norm(text);

  return (
    <div className="space-y-6">
      <form action={checkAction} className="card space-y-4 p-6">
        <div>
          <label htmlFor="import-file" className="label">Choose a spreadsheet file (.csv)</label>
          <input id="import-file" type="file" accept=".csv,.tsv,.txt,text/csv" className="field" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setText(await file.text()); }} />
        </div>
        <div>
          <label htmlFor="import-text" className="label">…or paste it here</label>
          <textarea id="import-text" name="text" value={text} onChange={(e) => setText(e.target.value)} className="field !min-h-56 font-mono text-sm" placeholder={"name,category,price,size,color,stock\nPolo Shirt,Shirts & Polos,20,S,Navy,5"} />
        </div>
        {stale ? <p role="status" className="text-sm font-medium text-warn">You changed the list after checking it. Check it again before importing.</p> : null}
        <button type="submit" className="btn-primary" disabled={checking || !text.trim()}>{checking ? "Checking…" : "Check file"}</button>
        <FormMessage state={stale ? {} : check} />
      </form>

      {data && !stale ? (
        <section id="import-step-2" className="card space-y-4 p-6" aria-labelledby="result">
          <h2 id="result" className="text-lg font-semibold">What will happen</h2>
          {data.problems.length > 0 ? (
            <ul className="space-y-2">
              {data.problems.map((p, i) => <li key={i} className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900"><strong>Line {p.line}:</strong> {p.message}</li>)}
            </ul>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>{data.products} product{data.products === 1 ? "" : "s"} will be created as <strong>drafts</strong>. Nothing goes live by accident.</li>
              {data.newCategories.length ? <li>New categories that will be created: {data.newCategories.join(", ")}.</li> : null}
              {data.skipped.length ? <li>Already in the store, left alone: {data.skipped.join(", ")}.</li> : null}
            </ul>
          )}
          <form action={runAction}>
            <input type="hidden" name="text" value={text} />
            <button type="submit" className="btn-primary" disabled={!ready || running}>{running ? "Importing…" : `Import ${data.products} product${data.products === 1 ? "" : "s"}`}</button>
          </form>
          <FormMessage state={run} />
        </section>
      ) : null}
    </div>
  );
}
