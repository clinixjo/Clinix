import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

/**
 * Patient data archive (Jordanian data-protection right of access).
 * Owner/admin only. RLS scopes every query to the caller's clinic, so
 * a manager can only ever export their own clinic's patient. Streams a
 * complete JSON file and records a patient_exported audit entry.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (profile.role !== "owner" && profile.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: patient } = await supabase
    .from("patients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!patient) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [visits, medicalNotes, sales, appointments, followups, messages, packages] =
    await Promise.all([
      supabase.from("visits").select("*").eq("patient_id", id),
      supabase.from("patient_medical_notes").select("*").eq("patient_id", id),
      supabase.from("sales").select("*, sale_items(*)").eq("patient_id", id),
      supabase.from("appointments").select("*").eq("patient_id", id),
      supabase.from("followups").select("*").eq("patient_id", id),
      supabase.from("message_log").select("*").eq("patient_id", id),
      supabase.from("patient_packages").select("*").eq("patient_id", id),
    ]);

  const archive = {
    exported_at: new Date().toISOString(),
    clinic: { id: profile.clinic_id, name: profile.clinic.name },
    exported_by: { id: profile.id, name: profile.name },
    patient,
    visits: visits.data ?? [],
    medical_notes: medicalNotes.data ?? [],
    sales: sales.data ?? [],
    appointments: appointments.data ?? [],
    followups: followups.data ?? [],
    messages: messages.data ?? [],
    packages: packages.data ?? [],
  };

  await logAudit("patient_exported", "patients", id, { format: "json" });

  return new NextResponse(JSON.stringify(archive, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="patient-${id.slice(0, 8)}-archive.json"`,
    },
  });
}
