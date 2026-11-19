import type { Promotion } from "@/lib/promotions";
import { savePromotionAction } from "@/app/admin/(panel)/promotions/actions";
import { toLocalInput } from "@/lib/format";
import { ActionForm, SubmitButton, Toggle } from "./admin-forms";

export function PromotionForm({ promo, timezone }: { promo?: Promotion; timezone: string }) {
  return (
    <ActionForm action={savePromotionAction} className="card space-y-4 p-6">
      {promo ? <input type="hidden" name="id" value={promo.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="code" className="label">Code</label><input id="code" name="code" defaultValue={promo?.code} required maxLength={30} className="field uppercase" autoCapitalize="characters" /><p className="hint">What customers type. Letters, numbers, - and _.</p></div>
        <div><label htmlFor="kind" className="label">Type</label><select id="kind" name="kind" defaultValue={promo?.kind ?? "percent"} className="field"><option value="percent">Percent off</option><option value="fixed">Dollars off</option></select></div>
        <div><label htmlFor="value" className="label">Amount</label><input id="value" name="value" required defaultValue={promo ? (promo.kind === "percent" ? String(promo.value) : (promo.value / 100).toFixed(2)) : ""} className="field" inputMode="decimal" /><p className="hint">For “Percent off”: 10 means 10%. For “Dollars off”: 5 means $5.00.</p></div>
        <div><label htmlFor="minSubtotal" className="label">Minimum order (optional)</label><input id="minSubtotal" name="minSubtotal" defaultValue={promo && promo.min_subtotal_cents ? (promo.min_subtotal_cents / 100).toFixed(2) : ""} className="field" inputMode="decimal" /></div>
        <div><label htmlFor="startsAt" className="label">Starts (optional)</label><input id="startsAt" name="startsAt" type="datetime-local" defaultValue={toLocalInput(promo?.starts_at, timezone)} className="field" /></div>
        <div><label htmlFor="endsAt" className="label">Ends (optional)</label><input id="endsAt" name="endsAt" type="datetime-local" defaultValue={toLocalInput(promo?.ends_at, timezone)} className="field" /></div>
        <div><label htmlFor="maxUses" className="label">Maximum uses (optional)</label><input id="maxUses" name="maxUses" defaultValue={promo?.max_uses ?? ""} className="field" inputMode="numeric" />{promo ? <p className="hint">Used {promo.used_count} time{promo.used_count === 1 ? "" : "s"} so far.</p> : null}</div>
      </div>
      <p className="hint">Times use the store’s time zone ({timezone}). Discount codes only work while “Discount codes” is switched on in Settings.</p>
      <Toggle name="active" label="Active" defaultChecked={promo?.active ?? true} />
      <SubmitButton>Save promotion</SubmitButton>
    </ActionForm>
  );
}
