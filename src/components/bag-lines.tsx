"use client";

import Link from "next/link";
import type { QuoteLine } from "@/lib/orders/quote";
import { formatMoney } from "@/lib/util";
import { Icon } from "./icons";
import { Photo, Price } from "./ui";

export function QtyStepper({ name, quantity, max, onChange }: { name: string; quantity: number; max: number | null; onChange: (q: number) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-line-strong">
      <button type="button" className="grid size-9 place-items-center rounded-full hover:bg-soft" aria-label={`Decrease quantity of ${name}`} onClick={() => onChange(quantity - 1)}>
        <Icon name="minus" size={16} />
      </button>
      <span className="min-w-7 text-center text-sm font-medium" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        className="grid size-9 place-items-center rounded-full hover:bg-soft disabled:opacity-35"
        aria-label={`Increase quantity of ${name}`}
        disabled={max !== null && quantity >= max}
        onClick={() => onChange(quantity + 1)}
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

/** One item in the bag, compact enough for the side drawer. */
export function BagLine({ line, onQuantity, onRemove, onNavigate }: { line: QuoteLine; onQuantity: (q: number) => void; onRemove: () => void; onNavigate?: () => void }) {
  return (
    <li className="flex gap-4 py-5">
      <Link href={`/products/${line.slug}`} onClick={onNavigate} className="block size-24 shrink-0 overflow-hidden bg-soft">
        <Photo image={line.image} sizes="96px" className="size-full" fallbackLabel="No photo" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/products/${line.slug}`} onClick={onNavigate} className="font-medium hover:underline">
              {line.name}
            </Link>
            {line.variantLabel ? <p className="text-sm text-muted">{line.variantLabel}</p> : null}
          </div>
          <p className="shrink-0 font-medium">{formatMoney(line.lineTotalCents)}</p>
        </div>
        <p className="mt-0.5 text-sm text-muted">
          <Price cents={line.unitPriceCents} originalCents={line.originalUnitPriceCents} className="text-sm" /> each
        </p>
        <div className="mt-auto flex items-center justify-between pt-3">
          <QtyStepper name={line.name} quantity={line.quantity} max={line.maxQuantity} onChange={onQuantity} />
          <button type="button" onClick={onRemove} className="grid size-9 place-items-center rounded-full text-muted hover:bg-soft hover:text-ink" aria-label={`Remove ${line.name} from your bag`}>
            <Icon name="trash" size={18} />
          </button>
        </div>
        {line.issue ? (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            {line.issue}
          </p>
        ) : null}
      </div>
    </li>
  );
}
