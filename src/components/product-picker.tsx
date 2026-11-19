"use client";

import { useMemo, useState } from "react";

/** Choose up to `max` products, in order. Writes one hidden "featuredIds" field per chosen product. */
export function ProductPicker({ name, products, initial, max = 12 }: { name: string; products: { id: string; name: string }[]; initial: string[]; max?: number }) {
  const [picked, setPicked] = useState<string[]>(initial.filter((id) => products.some((p) => p.id === id)));
  const [filter, setFilter] = useState("");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
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
    <div>
      {picked.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
      <p className="mb-3 text-sm text-muted">{picked.length === 0 ? "None chosen: the “Featured” row shows products marked Featured." : `${picked.length} of ${max} chosen. Use the arrows to set the order.`}</p>
      {picked.length > 0 ? (
        <ol className="mb-4 space-y-1.5">
          {picked.map((id, i) => (
            <li key={id} className="flex items-center justify-between gap-2 rounded-xl bg-soft px-3 py-2 text-sm">
              <span>{i + 1}. {byId.get(id)}</span>
              <span className="flex gap-1">
                <button type="button" className="btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${byId.get(id)} earlier`}>↑</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === picked.length - 1} aria-label={`Move ${byId.get(id)} later`}>↓</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setPicked((c) => c.filter((x) => x !== id))} aria-label={`Remove ${byId.get(id)}`}>Remove</button>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <label htmlFor="picker-filter" className="label">Find products to add</label>
      <input id="picker-filter" className="field mb-3" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Type to search" />
      <ul className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
        {shown.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-soft">
              <input type="checkbox" checked={picked.includes(p.id)} disabled={!picked.includes(p.id) && picked.length >= max} onChange={(e) => setPicked((c) => (e.target.checked ? [...c, p.id] : c.filter((x) => x !== p.id)))} className="size-5 accent-[var(--brand)]" />
              {p.name}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
