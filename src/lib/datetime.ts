/**
 * Appointment time handling (MVP).
 *
 * Times are treated as "floating" wall-clock: the datetime-local value
 * the user types is stored verbatim as UTC, and always displayed with
 * timeZone "UTC". This keeps what-you-type === what's-stored ===
 * what's-shown without per-clinic timezone conversion. A real clinic
 * timezone can be layered in later (M8) without changing stored data.
 *
 * Weeks start on Sunday (Jordan work week is Sun–Thu).
 */

/** Always format appointment date/times with this to show wall-clock. */
export const APPT_TZ = "UTC";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-07-08" -> Date at UTC midnight of that day. */
function dateStrToUtc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export function isValidDateStr(dateStr: string | undefined): dateStr is string {
  return Boolean(dateStr) && /^\d{4}-\d{2}-\d{2}$/.test(dateStr!);
}

/** Today's date as YYYY-MM-DD (UTC basis — see file note). */
export function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysStr(dateStr: string, days: number): string {
  return new Date(dateStrToUtc(dateStr).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** [start, end) ISO bounds covering a single day. */
export function dayRange(dateStr: string): { startISO: string; endISO: string } {
  const start = dateStrToUtc(dateStr);
  return {
    startISO: start.toISOString(),
    endISO: new Date(start.getTime() + DAY_MS).toISOString(),
  };
}

/** The Sunday on/just-before the given date. */
export function weekStart(dateStr: string): string {
  const d = dateStrToUtc(dateStr);
  return addDaysStr(dateStr, -d.getUTCDay());
}

/** 7 day-strings (Sun..Sat) plus the [start, end) ISO bounds. */
export function weekRange(dateStr: string): {
  days: string[];
  startISO: string;
  endISO: string;
} {
  const start = weekStart(dateStr);
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(start, i));
  return {
    days,
    startISO: dateStrToUtc(start).toISOString(),
    endISO: new Date(dateStrToUtc(start).getTime() + 7 * DAY_MS).toISOString(),
  };
}

/**
 * datetime-local value ("2026-07-08T14:30") -> stored UTC ISO.
 * Returns null if unparseable.
 */
export function localInputToISO(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00.000Z`;
}

/** Stored UTC ISO -> datetime-local value for editing a form field. */
export function isoToLocalInput(iso: string): string {
  return iso.slice(0, 16);
}

export function addMinutesISO(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}
