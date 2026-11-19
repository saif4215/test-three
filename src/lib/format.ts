/** Dates in the store's own time zone (so "Friday 2:00 PM" means the same to the owner and the customer). Browser-safe. */
export function formatDateTime(d: Date | string, timeZone: string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function formatDate(d: Date | string, timeZone: string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

import { DateTime } from "luxon";

/** The value for an <input type="datetime-local"> showing `date` in the store's time zone ("" for none). */
export function toLocalInput(date: Date | string | null | undefined, timeZone: string): string {
  if (!date) return "";
  const d = DateTime.fromJSDate(typeof date === "string" ? new Date(date) : date, { zone: timeZone });
  return d.isValid ? d.toFormat("yyyy-LL-dd'T'HH:mm") : "";
}

/** Reads an <input type="datetime-local"> value as a moment in the store's time zone. Returns null for empty/invalid. */
export function fromLocalInput(value: string, timeZone: string): Date | null {
  if (!value.trim()) return null;
  const d = DateTime.fromISO(value, { zone: timeZone });
  return d.isValid ? d.toJSDate() : null;
}
