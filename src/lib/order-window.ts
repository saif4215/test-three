import { DateTime } from "luxon";

/** Pure helpers (no server access) so the same wording is used in the shop, the checkout and the admin. */
export interface OrderWindow {
  opensAt: string | null;
  closesAt: string | null;
  note: string;
}
export type WindowState = "none" | "upcoming" | "open" | "closed";

export function orderWindowState(w: OrderWindow, now = new Date()): WindowState {
  const opens = w.opensAt ? new Date(w.opensAt) : null;
  const closes = w.closesAt ? new Date(w.closesAt) : null;
  if (!opens && !closes) return "none";
  if (opens && now < opens) return "upcoming";
  if (closes && now >= closes) return "closed";
  return "open";
}

export function formatWhen(iso: string, timezone: string): string {
  const d = DateTime.fromISO(iso, { zone: timezone });
  return d.isValid ? d.toFormat("cccc, LLLL d 'at' h:mm a ZZZZ") : iso;
}

export interface WindowMessages {
  state: WindowState;
  /** The slim notice shown under the header (null when there is no window). */
  banner: string | null;
  title: string | null;
  message: string | null;
}

export function orderWindowMessages(w: OrderWindow, timezone: string, now = new Date()): WindowMessages {
  const state = orderWindowState(w, now);
  const note = w.note.trim() ? ` ${w.note.trim()}` : "";
  if (state === "none") return { state, banner: null, title: null, message: null };
  if (state === "upcoming") {
    const m = `Ordering opens ${formatWhen(w.opensAt!, timezone)}.`;
    return { state, banner: m + note, title: "Ordering isn’t open yet", message: m + note };
  }
  if (state === "closed") {
    const m = `Ordering closed ${formatWhen(w.closesAt!, timezone)}. New orders can’t be placed right now.`;
    return { state, banner: m + note, title: "Ordering is closed", message: m + note };
  }
  return { state, banner: w.closesAt ? `Ordering is open until ${formatWhen(w.closesAt, timezone)}.${note}` : null, title: null, message: null };
}
