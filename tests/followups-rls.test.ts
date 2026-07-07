/**
 * M5 — retargeting & follow-ups (Definition of Done).
 *
 *  1. A visit for a service with a follow-up interval auto-generates a
 *     follow-up at visit_date + interval; re-visiting supersedes the
 *     old pending one. A service with no interval generates nothing.
 *  2. Tenant isolation on followups and message_log.
 *  3. message_log is append-only and clinic-scoped.
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
    "⚠ Supabase env vars missing (.env.local) — followups RLS tests SKIPPED. " +
      "M5 is not Done until these pass against a real project."
  );
}

const PASSWORD = "followups-Passw0rd!";
const run = randomUUID().slice(0, 8);

let admin: SupabaseClient;
const seeded = {} as {
  clinicA: string;
  clinicB: string;
  patientA: string;
  patientB: string;
  serviceA: string; // 30-day interval
  serviceNoInterval: string;
};
const users = {} as Record<
  "receptionistA" | "ownerB",
  { id: string; email: string }
>;

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

async function createStaff(clinicId: string, role: string, label: string) {
  const email = `fu-${label}-${run}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  const { error: pErr } = await admin
    .from("users")
    .insert({ id: data.user.id, clinic_id: clinicId, role, name: label, email });
  if (pErr) throw new Error(`profile ${label}: ${pErr.message}`);
  return { id: data.user.id, email };
}

async function addVisit(patientId: string, serviceId: string, date: string) {
  const { data, error } = await admin
    .from("visits")
    .insert({
      clinic_id: seeded.clinicA,
      patient_id: patientId,
      service_id: serviceId,
      visit_date: date,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

describe.skipIf(!hasEnv)("follow-ups & message log (M5)", () => {
  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: clinics } = await admin
      .from("clinics")
      .insert([
        { name: `FU A ${run}`, slug: `fu-a-${run}` },
        { name: `FU B ${run}`, slug: `fu-b-${run}` },
      ])
      .select("id");
    seeded.clinicA = clinics![0].id;
    seeded.clinicB = clinics![1].id;

    users.receptionistA = await createStaff(seeded.clinicA, "receptionist", "recep-a");
    users.ownerB = await createStaff(seeded.clinicB, "owner", "owner-b");

    const { data: patients } = await admin
      .from("patients")
      .insert([
        { clinic_id: seeded.clinicA, name: "FU Patient A", whatsapp: "0791234567" },
        { clinic_id: seeded.clinicB, name: "FU Patient B" },
      ])
      .select("id, clinic_id");
    seeded.patientA = patients!.find((p) => p.clinic_id === seeded.clinicA)!.id;
    seeded.patientB = patients!.find((p) => p.clinic_id === seeded.clinicB)!.id;

    const { data: services } = await admin
      .from("services")
      .insert([
        { clinic_id: seeded.clinicA, name: "Filler", price: 200, followup_interval_days: 30 },
        { clinic_id: seeded.clinicA, name: "Consultation", price: 20 },
      ])
      .select("id, name");
    seeded.serviceA = services!.find((s) => s.name === "Filler")!.id;
    seeded.serviceNoInterval = services!.find((s) => s.name === "Consultation")!.id;
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("clinics").delete().in("id", [seeded.clinicA, seeded.clinicB]);
    for (const { id } of Object.values(users)) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  // ---------------------------------------------------------
  // Auto-generation
  // ---------------------------------------------------------

  it("a visit auto-generates a follow-up at visit_date + interval", async () => {
    await addVisit(seeded.patientA, seeded.serviceA, "2026-07-01");

    const { data } = await admin
      .from("followups")
      .select("due_date, status, reason, service_id")
      .eq("patient_id", seeded.patientA)
      .eq("service_id", seeded.serviceA)
      .eq("status", "pending");

    expect(data!.length).toBe(1);
    expect(data![0].due_date).toBe("2026-07-31"); // +30 days
    expect(data![0].reason).toBe("service");
  });

  it("re-visiting supersedes the previous pending follow-up", async () => {
    await addVisit(seeded.patientA, seeded.serviceA, "2026-08-01");

    const { data: pending } = await admin
      .from("followups")
      .select("due_date")
      .eq("patient_id", seeded.patientA)
      .eq("service_id", seeded.serviceA)
      .eq("status", "pending");
    expect(pending!.length).toBe(1);
    expect(pending![0].due_date).toBe("2026-08-31");

    const { data: dismissed } = await admin
      .from("followups")
      .select("id")
      .eq("patient_id", seeded.patientA)
      .eq("service_id", seeded.serviceA)
      .eq("status", "dismissed");
    expect(dismissed!.length).toBeGreaterThanOrEqual(1);
  });

  it("a service with no interval generates no follow-up", async () => {
    await addVisit(seeded.patientA, seeded.serviceNoInterval, "2026-07-01");
    const { data } = await admin
      .from("followups")
      .select("id")
      .eq("patient_id", seeded.patientA)
      .eq("service_id", seeded.serviceNoInterval);
    expect(data).toEqual([]);
  });

  // ---------------------------------------------------------
  // Tenant isolation
  // ---------------------------------------------------------

  it("clinic B owner cannot see clinic A's follow-ups", async () => {
    const b = await signIn(users.ownerB.email);
    const { data } = await b
      .from("followups")
      .select("clinic_id")
      .eq("clinic_id", seeded.clinicA);
    expect(data).toEqual([]);
  });

  // ---------------------------------------------------------
  // message_log — append-only, clinic-scoped
  // ---------------------------------------------------------

  it("a clinic member can log a message; it stays in-clinic", async () => {
    const recep = await signIn(users.receptionistA.email);
    const { data, error } = await recep
      .from("message_log")
      .insert({
        clinic_id: seeded.clinicA,
        patient_id: seeded.patientA,
        type: "service_followup",
        channel: "whatsapp",
        body: "Hello 🌿",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();

    const b = await signIn(users.ownerB.email);
    const { data: bView } = await b
      .from("message_log")
      .select("id")
      .eq("id", data!.id);
    expect(bView).toEqual([]);
  });

  it("message_log is append-only (no update/delete)", async () => {
    const recep = await signIn(users.receptionistA.email);
    const { data: logged } = await recep
      .from("message_log")
      .insert({
        clinic_id: seeded.clinicA,
        patient_id: seeded.patientA,
        type: "service_followup",
        channel: "whatsapp",
        body: "original",
      })
      .select("id")
      .single();

    const { data: updated } = await recep
      .from("message_log")
      .update({ body: "tampered" })
      .eq("id", logged!.id)
      .select();
    expect(updated).toEqual([]);

    const { data: deleted } = await recep
      .from("message_log")
      .delete()
      .eq("id", logged!.id)
      .select();
    expect(deleted).toEqual([]);
  });

  it("cannot log a message into another clinic", async () => {
    const recep = await signIn(users.receptionistA.email);
    const { error } = await recep.from("message_log").insert({
      clinic_id: seeded.clinicB,
      patient_id: seeded.patientB,
      type: "service_followup",
      channel: "whatsapp",
      body: "cross-clinic",
    });
    expect(error).not.toBeNull();
  });
});
