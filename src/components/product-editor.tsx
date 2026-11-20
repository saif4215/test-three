"use client";

import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import { saveProductAction } from "@/app/admin/(panel)/products/actions";
import type { ActionState } from "@/lib/action-state";
import { parseMoneyToCents } from "@/lib/util";
import { mediaUrl } from "@/lib/media-url";
import { FormMessage } from "./admin-forms";
import { Icon } from "./icons";

export interface EditorInitial {
  id: string | null;
  name: string;
  shortDescription: string;
  description: string;
  instructions: string;
  sizeChart: string;
  status: "draft" | "published" | "archived";
  price: string;
  salePrice: string;
  sku: string;
  tags: string;
  featured: boolean;
  trackInventory: boolean;
  lowStockThreshold: string;
  categoryIds: string[];
  images: { assetId: string; alt: string; color: string; storageKey: string; widths: number[] }[];
  variants: { id: string | null; sku: string; size: string; color: string; price: string; stock: string; threshold: string; active: boolean }[];
}

interface VariantRow {
  key: string;
  id: string | null;
  sku: string;
  size: string;
  color: string;
  price: string;
  stock: string;
  threshold: string;
  active: boolean;
}
interface ImageRow {
  key: string;
  assetId: string;
  url: string;
  alt: string;
  color: string;
}

let counter = 0;
const nextKey = () => `k${++counter}`;
const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export function ProductEditor({ initial, categories, saved }: { initial: EditorInitial; categories: { id: string; name: string }[]; saved?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveProductAction, {});
  const [clientError, setClientError] = useState<string | null>(null);
  const [f, setF] = useState({ ...initial });
  const [variants, setVariants] = useState<VariantRow[]>(() => initial.variants.map((v) => ({ ...v, key: nextKey() })));
  const [images, setImages] = useState<ImageRow[]>(() => initial.images.map((i) => ({ key: nextKey(), assetId: i.assetId, url: mediaUrl({ storage_key: i.storageKey, widths: i.widths }, 400), alt: i.alt, color: i.color })));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [genSizes, setGenSizes] = useState("");
  const [genColors, setGenColors] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const colours = useMemo(() => [...new Set(variants.map((v) => v.color.trim()).filter(Boolean))], [variants]);

  function build(intent: "save" | "publish") {
    const money = (label: string, raw: string, required: boolean) => {
      if (!raw.trim()) {
        if (required) throw new Error(`Enter the ${label}.`);
        return null;
      }
      const c = parseMoneyToCents(raw);
      if (c === null) throw new Error(`“${raw}” isn’t a valid ${label}. Use numbers such as 20 or 19.99.`);
      return c;
    };
    const int = (label: string, raw: string, fallback: number | null) => {
      if (!raw.trim()) return fallback;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new Error(`${label} must be a whole number, 0 or more.`);
      return n;
    };
    return {
      id: f.id,
      name: f.name,
      shortDescription: f.shortDescription,
      description: f.description,
      instructions: f.instructions,
      sizeChart: f.sizeChart,
      status: intent === "publish" ? "published" : f.status,
      priceCents: money("price", f.price, true),
      salePriceCents: money("sale price", f.salePrice, false),
      sku: f.sku,
      tags: list(f.tags),
      featured: f.featured,
      trackInventory: f.trackInventory,
      lowStockThreshold: int("The default low-stock level", f.lowStockThreshold, null),
      categoryIds: f.categoryIds,
      images: images.map((i) => ({ assetId: i.assetId, alt: i.alt, color: i.color, isPrimary: false })),
      variants: variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        size: v.size,
        color: v.color,
        priceCents: money("option price", v.price, false),
        stock: int("Stock", v.stock, 0) ?? 0,
        lowStockThreshold: int("The low-stock level", v.threshold, null),
        active: v.active,
      })),
    };
  }

  function submit(intent: "save" | "publish") {
    try {
      setClientError(null);
      const payload = build(intent);
      const fd = new FormData();
      fd.set("payload", JSON.stringify(payload));
      fd.set("intent", intent);
      startTransition(() => action(fd));
    } catch (e) {
      setClientError((e as Error).message);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch("/api/admin/uploads", { method: "POST", body: fd });
        const body = (await res.json()) as { id?: string; url?: string; error?: string };
        if (!res.ok || !body.id) throw new Error(body.error ?? "The upload failed.");
        setImages((cur) => [...cur, { key: nextKey(), assetId: body.id!, url: body.url!, alt: "", color: "" }]);
      }
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function generate() {
    const sizes = list(genSizes);
    const cols = list(genColors);
    if (!sizes.length && !cols.length) return;
    const combos: [string, string][] = [];
    for (const s of sizes.length ? sizes : [""]) for (const c of cols.length ? cols : [""]) combos.push([s, c]);
    setVariants((cur) => {
      const have = new Set(cur.map((v) => `${v.size.toLowerCase()}|${v.color.toLowerCase()}`));
      const add = combos.filter(([s, c]) => !have.has(`${s.toLowerCase()}|${c.toLowerCase()}`)).map(([size, color]) => ({ key: nextKey(), id: null, sku: "", size, color, price: "", stock: "0", threshold: "", active: true }));
      // A lone empty starter option is replaced by the generated ones.
      const base = cur.length === 1 && !cur[0].size && !cur[0].color && add.length ? [] : cur;
      return [...base, ...add];
    });
    setGenSizes("");
    setGenColors("");
  }

  const move = <T,>(arr: T[], i: number, d: number): T[] => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return arr;
    const copy = [...arr];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  };

  const card = "card mb-6 p-6";
  const h2 = "mb-4 text-lg font-semibold";
  const cell = "field !min-h-10 !py-1.5 !text-sm";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit("save");
      }}
      aria-busy={pending}
    >
      {saved ? <p role="status" className="mb-6 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm font-medium text-green-900">Saved.</p> : null}

      <section className={card} aria-labelledby="basics">
        <h2 id="basics" className={h2}>Basics</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="label">Name</label>
            <input id="name" className="field" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={120} required />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="short" className="label">Short line under the name</label>
            <input id="short" className="field" value={f.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} maxLength={200} />
            <p className="hint">For example “Classic polo” or “11 oz mug”. Shown beside the category.</p>
          </div>
          <div>
            <label htmlFor="price" className="label">Price (USD)</label>
            <input id="price" className="field" inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} required />
          </div>
          <div>
            <label htmlFor="sale" className="label">Sale price (optional)</label>
            <input id="sale" className="field" inputMode="decimal" value={f.salePrice} onChange={(e) => set("salePrice", e.target.value)} />
            <p className="hint">Must be lower than the price. Leave empty for no sale.</p>
          </div>
          <div>
            <label htmlFor="status" className="label">Status</label>
            <select id="status" className="field" value={f.status} onChange={(e) => set("status", e.target.value as typeof f.status)}>
              <option value="draft">Draft (hidden from customers)</option>
              <option value="published">Published (visible in the store)</option>
              <option value="archived">Archived (hidden)</option>
            </select>
          </div>
          <div>
            <label htmlFor="sku" className="label">SKU (optional)</label>
            <input id="sku" className="field" value={f.sku} onChange={(e) => set("sku", e.target.value)} maxLength={60} />
          </div>
          <label className="flex cursor-pointer items-start gap-3 sm:col-span-2">
            <input type="checkbox" checked={f.featured} onChange={(e) => set("featured", e.target.checked)} className="mt-1 size-5 accent-[var(--brand)]" />
            <span><span className="font-medium">Featured</span><span className="block text-sm text-muted">Shown in the “Featured” row on the homepage.</span></span>
          </label>
        </div>
      </section>

      <section className={card} aria-labelledby="photos">
        <h2 id="photos" className={h2}>Photos</h2>
        <p className="mb-4 text-sm text-muted">The first photo is the main one. Describe each photo in a few words (for people who use screen readers). Tag a photo with a colour to show it when that colour is chosen.</p>
        {images.length > 0 ? (
          <ul className="mb-4 space-y-3">
            {images.map((img, i) => (
              <li key={img.key} className="flex flex-wrap items-start gap-4 rounded-xl border border-line p-3">
                <img src={img.url} alt="" className="size-24 shrink-0 rounded-lg bg-soft object-cover" />
                <div className="min-w-[14rem] flex-1 space-y-2">
                  <div>
                    <label htmlFor={`alt-${i}`} className="label">Description of the photo{i === 0 ? " (main photo)" : ""}</label>
                    <input id={`alt-${i}`} className={cell} value={img.alt} onChange={(e) => setImages((cur) => cur.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} maxLength={300} placeholder="e.g. Navy polo shirt, front view" />
                  </div>
                  <div>
                    <label htmlFor={`col-${i}`} className="label">Colour (optional)</label>
                    <input id={`col-${i}`} list="colour-options" className={cell} value={img.color} onChange={(e) => setImages((cur) => cur.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} maxLength={40} />
                  </div>
                </div>
                <div className="flex gap-1">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setImages((cur) => move(cur, i, -1))} disabled={i === 0} aria-label={`Move photo ${i + 1} earlier`}>↑</button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setImages((cur) => move(cur, i, 1))} disabled={i === images.length - 1} aria-label={`Move photo ${i + 1} later`}>↓</button>
                  <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 1}`}><Icon name="trash" size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <datalist id="colour-options">{colours.map((c) => <option key={c} value={c} />)}</datalist>
        <label htmlFor="files" className="btn-secondary btn-sm cursor-pointer">{uploading ? "Uploading…" : "Add photos"}</label>
        <input id="files" ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => upload(e.target.files)} />
        {uploadError ? <p role="alert" className="mt-2 text-sm font-medium text-danger">{uploadError}</p> : null}
      </section>

      <section className={card} aria-labelledby="options">
        <h2 id="options" className={h2}>Sizes, colours and stock</h2>
        <div className="mb-4 grid gap-3 rounded-xl bg-soft p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="gen-sizes" className="label">Sizes</label>
            <input id="gen-sizes" className={cell} value={genSizes} onChange={(e) => setGenSizes(e.target.value)} placeholder="S, M, L, XL" />
          </div>
          <div>
            <label htmlFor="gen-colours" className="label">Colours</label>
            <input id="gen-colours" className={cell} value={genColors} onChange={(e) => setGenColors(e.target.value)} placeholder="Navy, White" />
          </div>
          <button type="button" onClick={generate} className="btn-secondary btn-sm">Add all combinations</button>
        </div>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Options for this product</caption>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="pb-2 pr-2 font-semibold">Size</th>
                <th scope="col" className="pb-2 pr-2 font-semibold">Colour</th>
                <th scope="col" className="pb-2 pr-2 font-semibold">SKU</th>
                <th scope="col" className="pb-2 pr-2 font-semibold">Own price</th>
                <th scope="col" className="pb-2 pr-2 font-semibold">Stock</th>
                <th scope="col" className="pb-2 pr-2 font-semibold">Low at</th>
                <th scope="col" className="pb-2 pr-2 font-semibold">Active</th>
                <th scope="col" className="pb-2"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v, i) => {
                const up = (patch: Partial<VariantRow>) => setVariants((cur) => cur.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <tr key={v.key}>
                    <td className="pr-2 pb-2"><input aria-label={`Size, option ${i + 1}`} className={cell} value={v.size} onChange={(e) => up({ size: e.target.value })} maxLength={30} /></td>
                    <td className="pr-2 pb-2"><input aria-label={`Colour, option ${i + 1}`} className={cell} value={v.color} onChange={(e) => up({ color: e.target.value })} maxLength={40} /></td>
                    <td className="pr-2 pb-2"><input aria-label={`SKU, option ${i + 1}`} className={cell} value={v.sku} onChange={(e) => up({ sku: e.target.value })} maxLength={60} /></td>
                    <td className="pr-2 pb-2"><input aria-label={`Own price, option ${i + 1}`} className={cell} inputMode="decimal" value={v.price} onChange={(e) => up({ price: e.target.value })} placeholder="same" /></td>
                    <td className="pr-2 pb-2"><input aria-label={`Stock, option ${i + 1}`} className={`${cell} w-24`} inputMode="numeric" value={v.stock} onChange={(e) => up({ stock: e.target.value })} /></td>
                    <td className="pr-2 pb-2"><input aria-label={`Low-stock level, option ${i + 1}`} className={`${cell} w-20`} inputMode="numeric" value={v.threshold} onChange={(e) => up({ threshold: e.target.value })} placeholder="auto" /></td>
                    <td className="pr-2 pb-2"><input type="checkbox" aria-label={`Active, option ${i + 1}`} checked={v.active} onChange={(e) => up({ active: e.target.checked })} className="size-5 accent-[var(--brand)]" /></td>
                    <td className="pb-2"><button type="button" className="btn-ghost btn-sm text-danger" onClick={() => setVariants((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`}><Icon name="trash" size={16} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => setVariants((cur) => [...cur, { key: nextKey(), id: null, sku: "", size: "", color: "", price: "", stock: "0", threshold: "", active: true }])}>
          Add one option
        </button>
        <p className="hint">Leave size or colour empty if the product doesn’t have them. “Own price” overrides the product price for that option only.</p>
        <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={f.trackInventory} onChange={(e) => set("trackInventory", e.target.checked)} className="mt-1 size-5 accent-[var(--brand)]" />
            <span><span className="font-medium">Track stock</span><span className="block text-sm text-muted">Stop selling an option when it runs out. Turn off for made-to-order items.</span></span>
          </label>
          <div>
            <label htmlFor="low" className="label">Low-stock level for this product</label>
            <input id="low" className="field" inputMode="numeric" value={f.lowStockThreshold} onChange={(e) => set("lowStockThreshold", e.target.value)} placeholder="Use the store default" />
          </div>
        </div>
      </section>

      <section className={card} aria-labelledby="details">
        <h2 id="details" className={h2}>Details</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="desc" className="label">Description</label>
            <textarea id="desc" className="field !min-h-40" value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={20000} />
            <p className="hint">Plain text, or Markdown (**bold**, lists, links).</p>
          </div>
          <div>
            <label htmlFor="instr" className="label">Good to know (optional)</label>
            <textarea id="instr" className="field" value={f.instructions} onChange={(e) => set("instructions", e.target.value)} maxLength={5000} />
          </div>
          <div>
            <label htmlFor="chart" className="label">Size guide (optional)</label>
            <textarea id="chart" className="field !min-h-32 font-mono text-sm" value={f.sizeChart} onChange={(e) => set("sizeChart", e.target.value)} maxLength={10000} placeholder={"| Size | Chest |\n|---|---|\n| S | 36 |"} />
            <p className="hint">Only enter measurements that have been confirmed. Tables use | separators.</p>
          </div>
        </div>
      </section>

      <section className={card} aria-labelledby="org">
        <h2 id="org" className={h2}>Organisation</h2>
        <fieldset>
          <legend className="label">Categories</legend>
          {categories.length === 0 ? (
            <p className="text-sm text-muted">No categories yet. Add some under Catalog → Categories.</p>
          ) : (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {categories.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={f.categoryIds.includes(c.id)} onChange={(e) => set("categoryIds", e.target.checked ? [...f.categoryIds, c.id] : f.categoryIds.filter((x) => x !== c.id))} className="size-5 accent-[var(--brand)]" />
                  {c.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <div className="mt-4">
          <label htmlFor="tags" className="label">Tags (optional)</label>
          <input id="tags" className="field" value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="polo, spirit-wear" />
          <p className="hint">Separate with commas. Customers can search for them.</p>
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-white/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="space-y-3">
          {clientError ? <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">{clientError}</p> : null}
          <FormMessage state={state} />
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn-secondary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
            {f.status !== "published" ? <button type="button" className="btn-primary" disabled={pending} onClick={() => submit("publish")}>Save &amp; publish</button> : null}
          </div>
        </div>
      </div>
    </form>
  );
}
