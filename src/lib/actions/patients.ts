"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { canAccessMedicalNotes, CONSENT_VERSION } from "@/lib/patients";

/** Error values are translation keys under `patients.form`. */
export type PatientFormState = {
  error:
    | "nameRequired"
    | "consentRequired"
    | "contactRequired"
    | "saveFailed";
} | null;

type PatientFields = {
  name: string;
  dob: string | null;
  gender: "female" | "male" | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  notes: string | null;
};

function readFields(formData: FormData): PatientFields {
  const text = (key: string): string | null => {
    const value = String(formData.get(key) ?? "").trim();
    return value === "" ? null : value;
  };
  const gender = text("gender");
  return {
    name: String(formData.get("name") ?? "").trim(),
    dob: text("dob"),
    gender: gender === "female" || gender === "male" ? gender : null,
    whatsapp: text("whatsapp"),
    phone: text("phone"),
    email: text("email"),
    source: text("source"),
    notes: text("notes"),
  };
}

function validate(fields: PatientFields): PatientFormState {
  if (!fields.name) return { error: "nameRequired" };
  // The retargeting engine needs a way to reach the patient.
  if (!fields.whatsapp && !fields.phone) return { error: "contactRequired" };
  return null;
}

export async function createPatient(
  _prevState: PatientFormState,
  formData: FormData
): Promise<PatientFormState> {
  const profile = await getProfile();
  if (!profile) return { error: "saveFailed" };

  const fields = readFields(formData);
  const invalid = validate(fields);
  if (invalid) return invalid;

  // Digital consent is mandatory at creation (Jordanian data
  // protection law) — record when and which wording was accepted.
  if (formData.get("consent") !== "on") {
    return { error: "consentRequired" };
  }

  const supabase = await createClient();
  const { data: patient, error } = await supabase
    .from("patients")
    .insert({
      ...fields,
      clinic_id: profile.clinic_id,
      consent_at: new Date().toISOString(),
      consent_version: CONSENT_VERSION,
    })
    .select("id")
    .single();

  if (error || !patient) return { error: "saveFailed" };

  // Optional first medical note — only for roles that may write one
  // (RLS blocks it anyway; this keeps the UX honest).
  const medicalNote = String(formData.get("medicalNote") ?? "").trim();
  if (medicalNote && canAccessMedicalNotes(profile.role)) {
    await supabase.from("patient_medical_notes").insert({
      clinic_id: profile.clinic_id,
      patient_id: patient.id,
      author_id: profile.id,
      note: medicalNote,
    });
  }

  revalidatePath("/[locale]/patients", "page");
  redirect(`/${await getLocale()}/patients/${patient.id}`);
}

export async function updatePatient(
  patientId: string,
  _prevState: PatientFormState,
  formData: FormData
): Promise<PatientFormState> {
  const fields = readFields(formData);
  const invalid = validate(fields);
  if (invalid) return invalid;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patients")
    .update(fields)
    .eq("id", patientId)
    .select("id");

  if (error || !data?.length) return { error: "saveFailed" };

  revalidatePath("/[locale]/patients", "layout");
  redirect(`/${await getLocale()}/patients/${patientId}`);
}

export async function deletePatient(patientId: string): Promise<void> {
  const supabase = await createClient();
  // RLS: only owner/admin rows match; others delete nothing.
  await supabase.from("patients").delete().eq("id", patientId);

  revalidatePath("/[locale]/patients", "page");
  redirect(`/${await getLocale()}/patients`);
}

export type MedicalNoteState = { error: "saveFailed" } | null;

export async function addMedicalNote(
  patientId: string,
  _prevState: MedicalNoteState,
  formData: FormData
): Promise<MedicalNoteState> {
  const profile = await getProfile();
  const note = String(formData.get("note") ?? "").trim();
  if (!profile || !note || !canAccessMedicalNotes(profile.role)) {
    return { error: "saveFailed" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("patient_medical_notes").insert({
    clinic_id: profile.clinic_id,
    patient_id: patientId,
    author_id: profile.id,
    note,
  });

  if (error) return { error: "saveFailed" };

  revalidatePath(`/[locale]/patients/${patientId}`, "page");
  return null;
}
