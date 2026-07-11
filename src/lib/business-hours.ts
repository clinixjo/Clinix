/**
 * Clinic business hours, stored in clinics.settings.business_hours.
 * Day index 0 = Sunday … 6 = Saturday. Jordan's default work week is
 * Sun–Thu open, Fri–Sat closed. (These feed the M3 calendar later to
 * block off-hour bookings.)
 */
export type DayHours = {
  day: number; // 0..6
  closed: boolean;
  open: string; // "HH:MM"
  close: string; // "HH:MM"
};

export const DEFAULT_BUSINESS_HOURS: DayHours[] = Array.from(
  { length: 7 },
  (_, day) => ({
    day,
    closed: day === 5 || day === 6, // Fri, Sat closed
    open: "09:00",
    close: "18:00",
  })
);

export function parseBusinessHours(value: unknown): DayHours[] {
  if (!Array.isArray(value) || value.length !== 7) {
    return DEFAULT_BUSINESS_HOURS;
  }
  return value.map((raw, day) => {
    const r = (raw ?? {}) as Partial<DayHours>;
    return {
      day,
      closed: Boolean(r.closed),
      open: typeof r.open === "string" ? r.open : "09:00",
      close: typeof r.close === "string" ? r.close : "18:00",
    };
  });
}
