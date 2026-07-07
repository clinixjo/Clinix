"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { canBookAppointments, type AppointmentStatus } from "@/lib/appointments";
import { addMinutesISO, localInputToISO } from "@/lib/datetime";

/** Error values are translation keys under `appointments.form`. */
export type AppointmentFormState = {
  error:
    | "patientRequired"
    | "serviceRequired"
    | "dateTimeRequired"
    | "timeConflict"
    | "saveFailed";
} | null;

const DEFAULT_DURATION_MIN = 30;
// Postgres exclusion_violation — the no-double-booking guard tripped.
const EXCLUSION_VIOLATION = "23P01";

type ParsedInput =
  | { ok: true; values: {
      patient_id: string;
      service_id: string;
      practitioner_id: string | null;
      startISO: string;
      notes: string | null;
    } }
  | { ok: false; error: NonNullable<AppointmentFormState>["error"] };

function parse(formData: FormData): ParsedInput {
  const patient_id = String(formData.get("patient_id") ?? "").trim();
  const service_id = String(formData.get("service_id") ?? "").trim();
  const practitionerRaw = String(formData.get("practitioner_id") ?? "").trim();
  const startRaw = String(formData.get("start_at") ?? "").trim();
  const notesRaw = String(formData.get("notes") ?? "").trim();

  if (!patient_id) return { ok: false, error: "patientRequired" };
  if (!service_id) return { ok: false, error: "serviceRequired" };

  const startISO = localInputToISO(startRaw);
  if (!startISO) return { ok: false, error: "dateTimeRequired" };

  return {
    ok: true,
    values: {
      patient_id,
      service_id,
      // "none" is the unassigned sentinel (Radix Select forbids empty values)
      practitioner_id:
        practitionerRaw === "" || practitionerRaw === "none"
          ? null
          : practitionerRaw,
      startISO,
      notes: notesRaw === "" ? null : notesRaw,
    },
  };
}

/** End time = start + the chosen service's duration (fallback 30m). */
async function endFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  serviceId: string,
  startISO: string
): Promise<string> {
  const { data } = await supabase
    .from("services")
    .select("duration_min")
    .eq("id", serviceId)
    .maybeSingle();
  const minutes = data?.duration_min ?? DEFAULT_DURATION_MIN;
  return addMinutesISO(startISO, minutes);
}

export async function createAppointment(
  _prevState: AppointmentFormState,
  formData: FormData
): Promise<AppointmentFormState> {
  const profile = await getProfile();
  if (!profile || !canBookAppointments(profile)) return { error: "saveFailed" };

  const parsed = parse(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const end_at = await endFor(supabase, parsed.values.service_id, parsed.values.startISO);

  const { error } = await supabase.from("appointments").insert({
    clinic_id: profile.clinic_id,
    patient_id: parsed.values.patient_id,
    service_id: parsed.values.service_id,
    practitioner_id: parsed.values.practitioner_id,
    start_at: parsed.values.startISO,
    end_at,
    notes: parsed.values.notes,
  });

  if (error) {
    if (error.code === EXCLUSION_VIOLATION) return { error: "timeConflict" };
    return { error: "saveFailed" };
  }

  revalidatePath("/[locale]/appointments", "page");
  redirect(
    `/${await getLocale()}/appointments?date=${parsed.values.startISO.slice(0, 10)}`
  );
}

export async function updateAppointment(
  appointmentId: string,
  _prevState: AppointmentFormState,
  formData: FormData
): Promise<AppointmentFormState> {
  const profile = await getProfile();
  if (!profile || !canBookAppointments(profile)) return { error: "saveFailed" };

  const parsed = parse(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const end_at = await endFor(supabase, parsed.values.service_id, parsed.values.startISO);

  const { data, error } = await supabase
    .from("appointments")
    .update({
      patient_id: parsed.values.patient_id,
      service_id: parsed.values.service_id,
      practitioner_id: parsed.values.practitioner_id,
      start_at: parsed.values.startISO,
      end_at,
      notes: parsed.values.notes,
    })
    .eq("id", appointmentId)
    .select("id");

  if (error) {
    if (error.code === EXCLUSION_VIOLATION) return { error: "timeConflict" };
    return { error: "saveFailed" };
  }
  if (!data?.length) return { error: "saveFailed" };

  revalidatePath("/[locale]/appointments", "page");
  redirect(
    `/${await getLocale()}/appointments?date=${parsed.values.startISO.slice(0, 10)}`
  );
}

/**
 * Status change. Completing triggers the DB visit-on-completion trigger,
 * so no visit is created here in app code.
 */
export async function setAppointmentStatus(
  appointmentId: string,
  status: AppointmentStatus
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("appointments")
    .update({ status })
    .eq("id", appointmentId);
  revalidatePath("/[locale]/appointments", "page");
}

export async function deleteAppointment(appointmentId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("appointments").delete().eq("id", appointmentId);
  revalidatePath("/[locale]/appointments", "page");
  redirect(`/${await getLocale()}/appointments`);
}
