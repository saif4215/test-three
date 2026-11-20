import { saveAnnouncementAction } from "@/app/admin/(panel)/content/actions";
import { toLocalInput } from "@/lib/format";
import { ActionForm, SubmitButton, Toggle } from "./admin-forms";

export interface AnnouncementRow {
  id: string;
  title: string;
  body_md: string;
  tone: string;
  link_url: string | null;
  link_label: string | null;
  starts_at: Date | null;
  ends_at: Date | null;
  active: boolean;
}

export function AnnouncementForm({ a, timezone }: { a?: AnnouncementRow; timezone: string }) {
  return (
    <ActionForm action={saveAnnouncementAction} className="card space-y-4 p-6">
      {a ? <input type="hidden" name="id" value={a.id} /> : null}
      <div><label htmlFor="title" className="label">Title</label><input id="title" name="title" defaultValue={a?.title} required maxLength={140} className="field" /></div>
      <div><label htmlFor="body" className="label">More text (optional)</label><textarea id="body" name="body" defaultValue={a?.body_md} maxLength={2000} className="field" /></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label htmlFor="tone" className="label">Type</label><select id="tone" name="tone" defaultValue={a?.tone ?? "info"} className="field"><option value="info">Information</option><option value="promo">Promotion</option><option value="important">Important</option></select></div>
        <div><label htmlFor="linkUrl" className="label">Link (optional)</label><input id="linkUrl" name="linkUrl" defaultValue={a?.link_url ?? ""} maxLength={300} className="field" /></div>
        <div><label htmlFor="linkLabel" className="label">Link text</label><input id="linkLabel" name="linkLabel" defaultValue={a?.link_label ?? ""} maxLength={40} className="field" /></div>
        <div><label htmlFor="startsAt" className="label">Starts (optional)</label><input id="startsAt" name="startsAt" type="datetime-local" defaultValue={toLocalInput(a?.starts_at, timezone)} className="field" /></div>
        <div><label htmlFor="endsAt" className="label">Ends (optional)</label><input id="endsAt" name="endsAt" type="datetime-local" defaultValue={toLocalInput(a?.ends_at, timezone)} className="field" /></div>
      </div>
      <p className="hint">Times use the store’s time zone ({timezone}).</p>
      <Toggle name="active" label="Show this announcement" defaultChecked={a?.active ?? true} />
      <SubmitButton>Save announcement</SubmitButton>
    </ActionForm>
  );
}
