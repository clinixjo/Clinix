import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth";

/**
 * Version tag stored with every recorded consent (consent_version).
 * Bump when the consent wording in messages/*.json meaningfully changes,
 * so we always know which text a patient agreed to.
 */
export const CONSENT_VERSION = "2026-07-v1";

/** Roles allowed to see/write medical notes (mirrors RLS policy). */
export function canAccessMedicalNotes(role: Profile["role"]): boolean {
  return role === "owner" || role === "practitioner";
}

export type PatientListItem = {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  source: string | null;
  created_at: string;
};

export type Patient = PatientListItem & {
  dob: string | null;
  gender: "female" | "male" | null;
  email: string | null;
  notes: string | null;
  consent_at: string | null;
  consent_version: string | null;
  purged_at: string | null;
};

export type MedicalNote = {
  id: string;
  note: string;
  created_at: string;
  author: { name: string } | null;
};

export type Visit = {
  id: string;
  visit_date: string;
  notes: string | null;
  service: { name: string } | null;
  practitioner: { name: string } | null;
};

export async function listPatients(query?: string): Promise<PatientListItem[]> {
  const supabase = await createClient();
  let request = supabase
    .from("patients")
    .select("id, name, phone, whatsapp, source, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const q = query?.trim();
  if (q) {
    const like = `%${q.replaceAll(/[%_]/g, "")}%`;
    request = request.or(
      `name.ilike.${like},phone.ilike.${like},whatsapp.ilike.${like}`
    );
  }

  const { data, error } = await request;
  if (error) throw new Error(`listPatients: ${error.message}`);
  return data ?? [];
}

export async function getPatient(id: string): Promise<Patient | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("patients")
    .select(
      "id, name, dob, gender, whatsapp, phone, email, source, notes, consent_at, consent_version, purged_at, created_at"
    )
    .eq("id", id)
    .maybeSingle();
  return data as Patient | null;
}

/** RLS returns an empty list for roles without access; UI gates too. */
export async function getMedicalNotes(patientId: string): Promise<MedicalNote[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("patient_medical_notes")
    .select("id, note, created_at, author:users(name)")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as MedicalNote[];
}

export async function getVisits(patientId: string): Promise<Visit[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("visits")
    .select(
      "id, visit_date, notes, service:services(name), practitioner:users(name)"
    )
    .eq("patient_id", patientId)
    .order("visit_date", { ascending: false });
  return (data ?? []) as unknown as Visit[];
}

export function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}
