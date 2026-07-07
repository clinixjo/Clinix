import { createClient } from "@/lib/supabase/server";
import { todayDateStr } from "@/lib/datetime";

export type DueFollowup = {
  id: string;
  due_date: string;
  reason: string;
  overdueDays: number;
  patient: { id: string; name: string; whatsapp: string | null; phone: string | null } | null;
  service: { name: string } | null;
};

export type PackageReminder = {
  id: string;
  remaining: number;
  packageName: string;
  contactedToday: boolean;
  patient: { id: string; name: string; whatsapp: string | null; phone: string | null } | null;
};

const one = <T>(rel: unknown): T | null =>
  (Array.isArray(rel) ? rel[0] : rel) as T | null;

/** Pending follow-ups whose due date has arrived (or passed). */
export async function getDueFollowups(): Promise<DueFollowup[]> {
  const supabase = await createClient();
  const today = todayDateStr();
  const { data, error } = await supabase
    .from("followups")
    .select(
      "id, due_date, reason, patient:patients(id, name, whatsapp, phone), service:services(name)"
    )
    .eq("status", "pending")
    .lte("due_date", today)
    .order("due_date", { ascending: true });
  if (error) throw new Error(`getDueFollowups: ${error.message}`);

  const now = Date.parse(`${today}T00:00:00Z`);
  return (data ?? []).map((f) => ({
    id: f.id,
    due_date: f.due_date,
    reason: f.reason,
    overdueDays: Math.max(
      0,
      Math.round((now - Date.parse(`${f.due_date}T00:00:00Z`)) / 86_400_000)
    ),
    patient: one(f.patient),
    service: one(f.service),
  }));
}

/** Patients with unused package sessions — a gentle nudge to rebook. */
export async function getPackageReminders(): Promise<PackageReminder[]> {
  const supabase = await createClient();
  const today = todayDateStr();

  const [{ data, error }, contacted] = await Promise.all([
    supabase
      .from("patient_packages")
      .select(
        "id, total_sessions, used_sessions, package:packages(name), service:services(name), patient:patients(id, name, whatsapp, phone)"
      )
      .order("purchased_at", { ascending: true }),
    supabase
      .from("message_log")
      .select("patient_id")
      .eq("type", "package_reminder")
      .gte("sent_at", `${today}T00:00:00Z`),
  ]);
  if (error) throw new Error(`getPackageReminders: ${error.message}`);

  const contactedSet = new Set((contacted.data ?? []).map((m) => m.patient_id));

  return (data ?? [])
    .map((pp) => {
      const remaining = pp.total_sessions - pp.used_sessions;
      const patient = one<{ id: string; name: string; whatsapp: string | null; phone: string | null }>(pp.patient);
      return {
        id: pp.id,
        remaining,
        packageName:
          one<{ name: string }>(pp.package)?.name ??
          one<{ name: string }>(pp.service)?.name ??
          "",
        contactedToday: patient ? contactedSet.has(patient.id) : false,
        patient,
      };
    })
    .filter((pp) => pp.remaining > 0);
}
