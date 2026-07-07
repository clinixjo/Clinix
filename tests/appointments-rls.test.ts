/**
 * M3 — appointments access control + mechanics (Definition of Done).
 *
 *  1. Tenant isolation on appointments and visits.
 *  2. Double-booking a practitioner is rejected by the DB exclusion
 *     constraint; non-overlapping / different-practitioner is allowed.
 *  3. Completing an appointment creates exactly one visit (idempotent).
 *  4. Receptionist can book; practitioner is gated by practitioner_can_edit.
 *
 * Requires a real Supabase project with all migrations applied
 * (.env.local) — self-skips otherwise. Run: npm run test:isolation
 */
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: [".env.local", ".env"], quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && anonKey && serviceKey);

if (!hasEnv) {
  console.warn(
    "⚠ Supabase env vars missing (.env.local) — appointments RLS tests SKIPPED. " +
      "M3 is not Done until these pass against a real project."
  );
}

const PASSWORD = "appointments-Passw0rd!";
const run = randomUUID().slice(0, 8);
const EXCLUSION_VIOLATION = "23P01";

let admin: SupabaseClient;
const seeded = {} as {
  clinicA: string;
  clinicB: string;
  patientA: string;
  patientB: string;
  serviceA: string;
  serviceB: string;
};
const users = {} as Record<
  "ownerA" | "receptionistA" | "practitionerA" | "ownerB",
  { id: string; email: string }
>;
let apptB: string;

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

async function createStaff(
  clinicId: string,
  role: string,
  label: string
): Promise<{ id: string; email: string }> {
  const email = `appt-${label}-${run}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  const { error: pErr } = await admin.from("users").insert({
    id: data.user.id,
    clinic_id: clinicId,
    role,
    name: label,
    email,
  });
  if (pErr) throw new Error(`profile ${label}: ${pErr.message}`);
  return { id: data.user.id, email };
}

// Non-overlapping slot helpers (floating UTC wall-clock).
const at = (hour: number) =>
  `2026-07-08T${String(hour).padStart(2, "0")}:00:00.000Z`;

describe.skipIf(!hasEnv)("appointments RLS & mechanics (M3)", () => {
  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: clinics, error } = await admin
      .from("clinics")
      .insert([
        { name: `Appt A ${run}`, slug: `appt-a-${run}` },
        { name: `Appt B ${run}`, slug: `appt-b-${run}` },
      ])
      .select("id");
    if (error) throw new Error(error.message);
    seeded.clinicA = clinics[0].id;
    seeded.clinicB = clinics[1].id;

    users.ownerA = await createStaff(seeded.clinicA, "owner", "owner-a");
    users.receptionistA = await createStaff(seeded.clinicA, "receptionist", "recep-a");
    users.practitionerA = await createStaff(seeded.clinicA, "practitioner", "pract-a");
    users.ownerB = await createStaff(seeded.clinicB, "owner", "owner-b");

    const { data: patients } = await admin
      .from("patients")
      .insert([
        { clinic_id: seeded.clinicA, name: "Patient A" },
        { clinic_id: seeded.clinicB, name: "Patient B" },
      ])
      .select("id, clinic_id");
    seeded.patientA = patients!.find((p) => p.clinic_id === seeded.clinicA)!.id;
    seeded.patientB = patients!.find((p) => p.clinic_id === seeded.clinicB)!.id;

    const { data: services } = await admin
      .from("services")
      .insert([
        { clinic_id: seeded.clinicA, name: "Svc A", price: 50, duration_min: 30 },
        { clinic_id: seeded.clinicB, name: "Svc B", price: 50, duration_min: 30 },
      ])
      .select("id, clinic_id");
    seeded.serviceA = services!.find((s) => s.clinic_id === seeded.clinicA)!.id;
    seeded.serviceB = services!.find((s) => s.clinic_id === seeded.clinicB)!.id;

    const { data: appt } = await admin
      .from("appointments")
      .insert({
        clinic_id: seeded.clinicB,
        patient_id: seeded.patientB,
        service_id: seeded.serviceB,
        start_at: at(10),
        end_at: at(11),
      })
      .select("id")
      .single();
    apptB = appt!.id;
  });

  afterAll(async () => {
    if (!admin) return;
    await admin
      .from("clinics")
      .delete()
      .in("id", [seeded.clinicA, seeded.clinicB]);
    for (const { id } of Object.values(users)) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  // ---------------------------------------------------------
  // Tenant isolation
  // ---------------------------------------------------------

  it("clinic A user sees only clinic A appointments", async () => {
    const a = await signIn(users.ownerA.email);
    const { data, error } = await a.from("appointments").select("clinic_id");
    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(row.clinic_id).toBe(seeded.clinicA);
    }
  });

  it("clinic A user cannot read or delete clinic B's appointment", async () => {
    const a = await signIn(users.ownerA.email);

    const { data: byId } = await a
      .from("appointments")
      .select("id")
      .eq("id", apptB);
    expect(byId).toEqual([]);

    const { data: deleted } = await a
      .from("appointments")
      .delete()
      .eq("id", apptB)
      .select();
    expect(deleted).toEqual([]);
  });

  it("clinic A user cannot insert an appointment into clinic B", async () => {
    const a = await signIn(users.ownerA.email);
    const { error } = await a.from("appointments").insert({
      clinic_id: seeded.clinicB,
      patient_id: seeded.patientB,
      service_id: seeded.serviceB,
      start_at: at(12),
      end_at: at(13),
    });
    expect(error).not.toBeNull();
  });

  // ---------------------------------------------------------
  // Double-booking guard
  // ---------------------------------------------------------

  it("rejects an overlapping appointment for the same practitioner", async () => {
    const owner = await signIn(users.ownerA.email);
    const base = {
      clinic_id: seeded.clinicA,
      patient_id: seeded.patientA,
      service_id: seeded.serviceA,
      practitioner_id: users.practitionerA.id,
    };

    const { data: first, error: firstErr } = await owner
      .from("appointments")
      .insert({ ...base, start_at: at(14), end_at: at(15) })
      .select("id")
      .single();
    expect(firstErr).toBeNull();

    // Overlaps 14:00–15:00 for the same practitioner → rejected.
    const { error: clashErr } = await owner
      .from("appointments")
      .insert({ ...base, start_at: at(14), end_at: at(15) });
    expect(clashErr?.code).toBe(EXCLUSION_VIOLATION);

    // A non-overlapping slot for the same practitioner is fine.
    const { error: laterErr } = await owner
      .from("appointments")
      .insert({ ...base, start_at: at(15), end_at: at(16) });
    expect(laterErr).toBeNull();

    await owner.from("appointments").delete().eq("id", first!.id);
  });

  it("allows the same time slot for a different practitioner", async () => {
    const owner = await signIn(users.ownerA.email);
    const { error } = await owner.from("appointments").insert([
      {
        clinic_id: seeded.clinicA,
        patient_id: seeded.patientA,
        service_id: seeded.serviceA,
        practitioner_id: users.ownerA.id,
        start_at: at(9),
        end_at: at(10),
      },
    ]);
    expect(error).toBeNull();
  });

  // ---------------------------------------------------------
  // Completion → visit
  // ---------------------------------------------------------

  it("creates exactly one visit when an appointment is completed", async () => {
    const owner = await signIn(users.ownerA.email);
    const { data: appt } = await owner
      .from("appointments")
      .insert({
        clinic_id: seeded.clinicA,
        patient_id: seeded.patientA,
        service_id: seeded.serviceA,
        practitioner_id: users.practitionerA.id,
        start_at: at(18),
        end_at: at(19),
      })
      .select("id")
      .single();

    await owner
      .from("appointments")
      .update({ status: "completed" })
      .eq("id", appt!.id);

    const { data: visits } = await admin
      .from("visits")
      .select("id, patient_id, clinic_id")
      .eq("appointment_id", appt!.id);
    expect(visits!.length).toBe(1);
    expect(visits![0].patient_id).toBe(seeded.patientA);
    expect(visits![0].clinic_id).toBe(seeded.clinicA);

    // Toggling status and re-completing must not duplicate the visit.
    await owner
      .from("appointments")
      .update({ status: "scheduled" })
      .eq("id", appt!.id);
    await owner
      .from("appointments")
      .update({ status: "completed" })
      .eq("id", appt!.id);

    const { data: again } = await admin
      .from("visits")
      .select("id")
      .eq("appointment_id", appt!.id);
    expect(again!.length).toBe(1);
  });

  // ---------------------------------------------------------
  // Role gating
  // ---------------------------------------------------------

  it("receptionist can book an appointment", async () => {
    const recep = await signIn(users.receptionistA.email);
    const { error } = await recep.from("appointments").insert({
      clinic_id: seeded.clinicA,
      patient_id: seeded.patientA,
      service_id: seeded.serviceA,
      start_at: at(7),
      end_at: at(8),
    });
    expect(error).toBeNull();
  });

  it("practitioner booking is gated by practitioner_can_edit", async () => {
    await admin
      .from("clinics")
      .update({ settings: { practitioner_can_edit: false } })
      .eq("id", seeded.clinicA);

    const pract = await signIn(users.practitionerA.email);
    const { error: blocked } = await pract.from("appointments").insert({
      clinic_id: seeded.clinicA,
      patient_id: seeded.patientA,
      service_id: seeded.serviceA,
      start_at: at(20),
      end_at: at(21),
    });
    expect(blocked).not.toBeNull();

    await admin
      .from("clinics")
      .update({ settings: { practitioner_can_edit: true } })
      .eq("id", seeded.clinicA);

    const pract2 = await signIn(users.practitionerA.email);
    const { error: allowed } = await pract2.from("appointments").insert({
      clinic_id: seeded.clinicA,
      patient_id: seeded.patientA,
      service_id: seeded.serviceA,
      start_at: at(21),
      end_at: at(22),
    });
    expect(allowed).toBeNull();
  });
});
