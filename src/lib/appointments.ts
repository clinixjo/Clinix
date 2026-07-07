import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "no_show"
  | "cancelled";

export type AppointmentRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
  notes: string | null;
  patient: { id: string; name: string } | null;
  service: { id: string; name: string; duration_min: number | null } | null;
  practitioner: { id: string; name: string } | null;
};

const SELECT =
  "id, start_at, end_at, status, notes, patient:patients(id, name), service:services(id, name, duration_min), practitioner:practitioner_id(id, name)";

/**
 * Booking follows the same rule as the RLS can_edit_records() helper:
 * owner/admin/receptionist always; practitioner only when the clinic's
 * practitioner_can_edit setting allows it.
 */
export function canBookAppointments(profile: Profile): boolean {
  if (profile.role === "practitioner") {
    return profile.clinic.settings.practitioner_can_edit === true;
  }
  return (
    profile.role === "owner" ||
    profile.role === "admin" ||
    profile.role === "receptionist"
  );
}

export async function listAppointmentsInRange(
  startISO: string,
  endISO: string
): Promise<AppointmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(SELECT)
    .gte("start_at", startISO)
    .lt("start_at", endISO)
    .order("start_at", { ascending: true });
  if (error) throw new Error(`listAppointmentsInRange: ${error.message}`);
  return (data ?? []) as unknown as AppointmentRow[];
}

export async function getAppointment(
  id: string
): Promise<AppointmentRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as AppointmentRow) ?? null;
}

/** Active staff who can be assigned to an appointment. */
export async function listPractitioners(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name")
    .eq("is_active", true)
    .in("role", ["owner", "admin", "practitioner"])
    .order("name", { ascending: true });
  if (error) throw new Error(`listPractitioners: ${error.message}`);
  return data ?? [];
}
