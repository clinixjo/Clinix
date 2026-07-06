/**
 * Tenant isolation test — the M0 Definition of Done.
 *
 * Verifies at the database level (RLS) that:
 *  1. A clinic A user can never read or write clinic B data, on any table.
 *  2. Medical notes are invisible to receptionists (practitioner/owner only).
 *  3. Practitioner write access follows the clinic's practitioner_can_edit setting.
 *
 * Requires a real Supabase project with the migrations applied:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY (from .env.local)
 *
 * Run with: npm run test:isolation
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
    "⚠ Supabase env vars missing (.env.local) — tenant isolation tests SKIPPED. " +
      "These MUST pass before building any feature on top of M0."
  );
}

const PASSWORD = "isolation-test-Passw0rd!";
const run = randomUUID().slice(0, 8);

type Seeded = {
  clinicA: string;
  clinicB: string;
  patientA: string;
  patientB: string;
  serviceB: string;
  users: Record<
    "ownerA" | "receptionistA" | "practitionerA" | "ownerB",
    { id: string; email: string }
  >;
};

let admin: SupabaseClient;
let seeded: Seeded;

function anonClient(): SupabaseClient {
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email: string): Promise<SupabaseClient> {
  const client = anonClient();
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
  const email = `isolation-${label}-${run}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  const { error: profileError } = await admin.from("users").insert({
    id: data.user.id,
    clinic_id: clinicId,
    role,
    name: label,
    email,
  });
  if (profileError)
    throw new Error(`profile ${label}: ${profileError.message}`);
  return { id: data.user.id, email };
}

describe.skipIf(!hasEnv)("tenant isolation (RLS)", () => {
  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: clinics, error } = await admin
      .from("clinics")
      .insert([
        { name: `Clinic A ${run}`, slug: `clinic-a-${run}` },
        { name: `Clinic B ${run}`, slug: `clinic-b-${run}` },
      ])
      .select("id");
    if (error) throw new Error(`seed clinics: ${error.message}`);
    const [clinicA, clinicB] = clinics.map((c) => c.id as string);

    const users = {
      ownerA: await createStaff(clinicA, "owner", "owner-a"),
      receptionistA: await createStaff(clinicA, "receptionist", "recep-a"),
      practitionerA: await createStaff(clinicA, "practitioner", "pract-a"),
      ownerB: await createStaff(clinicB, "owner", "owner-b"),
    };

    const { data: patients, error: patientsError } = await admin
      .from("patients")
      .insert([
        { clinic_id: clinicA, name: "Patient A", phone: "0791111111" },
        { clinic_id: clinicB, name: "Patient B", phone: "0792222222" },
      ])
      .select("id, clinic_id");
    if (patientsError) throw new Error(patientsError.message);
    const patientA = patients.find((p) => p.clinic_id === clinicA)!.id;
    const patientB = patients.find((p) => p.clinic_id === clinicB)!.id;

    const { error: notesError } = await admin
      .from("patient_medical_notes")
      .insert([
        { clinic_id: clinicA, patient_id: patientA, note: "note A" },
        { clinic_id: clinicB, patient_id: patientB, note: "note B" },
      ]);
    if (notesError) throw new Error(notesError.message);

    const { data: serviceB, error: serviceError } = await admin
      .from("services")
      .insert({ clinic_id: clinicB, name: "Laser B", price: 100 })
      .select("id")
      .single();
    if (serviceError) throw new Error(serviceError.message);

    const { error: salesError } = await admin.from("sales").insert([
      { clinic_id: clinicA, patient_id: patientA, total: 50 },
      { clinic_id: clinicB, patient_id: patientB, total: 75 },
    ]);
    if (salesError) throw new Error(salesError.message);

    seeded = { clinicA, clinicB, patientA, patientB, serviceB: serviceB.id, users };
  });

  afterAll(async () => {
    if (!admin || !seeded) return;
    // Clinics cascade to all tenant data; auth users removed explicitly.
    await admin.from("clinics").delete().in("id", [seeded.clinicA, seeded.clinicB]);
    for (const { id } of Object.values(seeded.users)) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  // ---------------------------------------------------------
  // 1. Cross-clinic isolation
  // ---------------------------------------------------------

  it("clinic A user sees only clinic A rows on every tenant table", async () => {
    const a = await signIn(seeded.users.ownerA.email);
    const tables = [
      "clinics",
      "users",
      "patients",
      "patient_medical_notes",
      "services",
      "appointments",
      "visits",
      "sales",
      "sale_items",
      "patient_packages",
      "followups",
      "message_log",
      "audit_log",
    ];
    for (const table of tables) {
      const { data, error } = await a.from(table).select("*");
      expect(error, `${table} select`).toBeNull();
      const key = table === "clinics" ? "id" : "clinic_id";
      for (const row of data ?? []) {
        expect(
          (row as Record<string, unknown>)[key],
          `${table} leaked a clinic B row`
        ).toBe(seeded.clinicA);
      }
    }
  });

  it("clinic A user cannot read clinic B's patient directly by id", async () => {
    const a = await signIn(seeded.users.ownerA.email);
    const { data } = await a
      .from("patients")
      .select("*")
      .eq("id", seeded.patientB);
    expect(data).toEqual([]);
  });

  it("clinic A user cannot insert data into clinic B", async () => {
    const a = await signIn(seeded.users.ownerA.email);
    const { error } = await a.from("patients").insert({
      clinic_id: seeded.clinicB,
      name: "Smuggled patient",
    });
    expect(error).not.toBeNull();
  });

  it("clinic A user cannot update or delete clinic B's data", async () => {
    const a = await signIn(seeded.users.ownerA.email);

    const { data: updated } = await a
      .from("patients")
      .update({ name: "Hacked" })
      .eq("id", seeded.patientB)
      .select();
    expect(updated).toEqual([]);

    const { data: deleted } = await a
      .from("patients")
      .delete()
      .eq("id", seeded.patientB)
      .select();
    expect(deleted).toEqual([]);

    const { data: check } = await admin
      .from("patients")
      .select("name")
      .eq("id", seeded.patientB)
      .single();
    expect(check?.name).toBe("Patient B");
  });

  it("clinic A owner cannot see clinic B staff or clinic row", async () => {
    const a = await signIn(seeded.users.ownerA.email);

    const { data: staff } = await a
      .from("users")
      .select("id")
      .eq("id", seeded.users.ownerB.id);
    expect(staff).toEqual([]);

    const { data: clinic } = await a
      .from("clinics")
      .select("id")
      .eq("id", seeded.clinicB);
    expect(clinic).toEqual([]);
  });

  it("anonymous (signed-out) client sees nothing", async () => {
    const anon = anonClient();
    const { data } = await anon.from("patients").select("*");
    expect(data).toEqual([]);
  });

  // ---------------------------------------------------------
  // 2. Medical notes restricted to practitioner/owner
  // ---------------------------------------------------------

  it("receptionist cannot read or write medical notes, even in own clinic", async () => {
    const recep = await signIn(seeded.users.receptionistA.email);

    const { data } = await recep.from("patient_medical_notes").select("*");
    expect(data).toEqual([]);

    const { error } = await recep.from("patient_medical_notes").insert({
      clinic_id: seeded.clinicA,
      patient_id: seeded.patientA,
      note: "should be rejected",
    });
    expect(error).not.toBeNull();
  });

  it("owner and practitioner can read own-clinic medical notes only", async () => {
    for (const who of ["ownerA", "practitionerA"] as const) {
      const client = await signIn(seeded.users[who].email);
      const { data, error } = await client
        .from("patient_medical_notes")
        .select("clinic_id, note");
      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
      for (const row of data!) {
        expect(row.clinic_id).toBe(seeded.clinicA);
      }
    }
  });

  // ---------------------------------------------------------
  // 3. practitioner_can_edit clinic setting
  // ---------------------------------------------------------

  it("practitioner cannot record services/sales when practitioner_can_edit is false", async () => {
    await admin
      .from("clinics")
      .update({ settings: { practitioner_can_edit: false } })
      .eq("id", seeded.clinicA);

    const pract = await signIn(seeded.users.practitionerA.email);

    const { error: serviceError } = await pract.from("services").insert({
      clinic_id: seeded.clinicA,
      name: "Unauthorized service",
      price: 10,
    });
    expect(serviceError).not.toBeNull();

    const { data: sales } = await pract.from("sales").select("*");
    expect(sales).toEqual([]);
  });

  it("practitioner can record services/sales when practitioner_can_edit is true", async () => {
    await admin
      .from("clinics")
      .update({ settings: { practitioner_can_edit: true } })
      .eq("id", seeded.clinicA);

    const pract = await signIn(seeded.users.practitionerA.email);

    const { error: serviceError } = await pract.from("services").insert({
      clinic_id: seeded.clinicA,
      name: "Practitioner-entered service",
      price: 10,
    });
    expect(serviceError).toBeNull();

    const { data: sales, error: salesError } = await pract
      .from("sales")
      .select("clinic_id");
    expect(salesError).toBeNull();
    expect(sales?.length).toBeGreaterThan(0);
    for (const row of sales!) {
      expect(row.clinic_id).toBe(seeded.clinicA);
    }

    // ...but still never clinic B's catalog
    const { data: bServices } = await pract
      .from("services")
      .select("*")
      .eq("id", seeded.serviceB);
    expect(bServices).toEqual([]);
  });
});
