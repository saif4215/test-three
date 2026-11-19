"use client";

import { useMemo, useState } from "react";
import { saveCollectionAction } from "@/app/admin/(panel)/collections/actions";
import { ActionForm, SubmitButton, Toggle } from "./admin-forms";

export interface CollectionInitial {
  id: string | null;
  title: string;
  description: string;
  status: "draft" | "published";
  startsAt: string;
  endsAt: string;
  featured: boolean;
  productIds: string[];
}

export function CollectionForm({ initial, products, timezone }: { initial: CollectionInitial; products: { id: string; name: string; status: string }[]; timezone: string }) {
  const [picked, setPicked] = useState<string[]>(initial.productIds);
  const [filter, setFilter] = useState("");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const shown = products.filter((p) => !filter.trim() || p.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const move = (i: number, d: number) =>
    setPicked((cur) => {
      const j = i + d;
      if (j < 0 || j >= cur.length) return cur;
      const c = [...cur];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  return (
    <ActionForm action={saveCollectionAction} className="space-y-6">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {picked.map((id) => <input key={id} type="hidden" name="productIds" value={id} />)}
      <section className="card space-y-4 p-6">
        <h2 className="text-lg font-semibold">Collection</h2>
        <div><label htmlFor="title" className="label">Title</label><input id="title" name="title" defaultValue={initial.title} required maxLength={80} className="field" /></div>
        <div><label htmlFor="description" className="label">Description (optional)</label><textarea id="description" name="description" defaultValue={initial.description} maxLength={500} className="field !min-h-24" /></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label htmlFor="status" className="label">Status</label><select id="status" name="status" defaultValue={initial.status} className="field"><option value="draft">Draft (hidden)</option><option value="published">Published</option></select></div>
          <div><label htmlFor="startsAt" className="label">Starts (optional)</label><input id="startsAt" name="startsAt" type="datetime-local" defaultValue={initial.startsAt} className="field" /></div>
          <div><label htmlFor="endsAt" className="label">Ends (optional)</label><input id="endsAt" name="endsAt" type="datetime-local" defaultValue={initial.endsAt} className="field" /></div>
        </div>
        <p className="hint">Times use the store’s time zone ({timezone}). A published collection only shows between its start and end.</p>
        <Toggle name="featured" label="Feature on the homepage" defaultChecked={initial.featured} />
      </section>

      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Products in this collection</h2>
        <p className="mb-4 text-sm text-muted">{picked.length} chosen. Use the arrows to set the order.</p>
        {picked.length > 0 ? (
          <ol className="mb-5 space-y-1.5">
            {picked.map((id, i) => (
              <li key={id} className="flex items-center justify-between gap-2 rounded-xl bg-soft px-3 py-2 text-sm">
                <span>{i + 1}. {byId.get(id)?.name ?? "(removed product)"}</span>
                <span className="flex gap-1">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${byId.get(id)?.name ?? "product"} earlier`}>↑</button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === picked.length - 1} aria-label={`Move ${byId.get(id)?.name ?? "product"} later`}>↓</button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setPicked((c) => c.filter((x) => x !== id))} aria-label={`Remove ${byId.get(id)?.name ?? "product"}`}>Remove</button>
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        <label htmlFor="pfilter" className="label">Find products to add</label>
        <input id="pfilter" className="field mb-3" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Type to search" />
        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
          {shown.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-soft">
                <input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked((c) => (e.target.checked ? [...c, p.id] : c.filter((x) => x !== p.id)))} className="size-5 accent-[var(--brand)]" />
                <span>{p.name}</span>
                {p.status !== "published" ? <span className="text-xs text-muted">({p.status})</span> : null}
              </label>
            </li>
          ))}
          {shown.length === 0 ? <li className="px-2 py-3 text-sm text-muted">No products match.</li> : null}
        </ul>
      </section>
      <SubmitButton>Save collection</SubmitButton>
    </ActionForm>
  );
}
