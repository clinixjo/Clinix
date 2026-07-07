/**
 * Patient acquisition sources — values stored in patients.source,
 * labels in messages/*.json under patients.sources.*
 */
export const PATIENT_SOURCES = [
  "instagram",
  "facebook",
  "tiktok",
  "google",
  "friend",
  "walk_in",
  "other",
] as const;

export type PatientSource = (typeof PATIENT_SOURCES)[number];

export function isKnownSource(value: string): value is PatientSource {
  return (PATIENT_SOURCES as readonly string[]).includes(value);
}
