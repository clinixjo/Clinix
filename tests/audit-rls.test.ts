/**
 * M8 — audit log & data rights (Definition of Done).
 *
 *  1. audit_log is readable only by owner/admin, is append-only, and is
 *     clinic-isolated.
 *  2. Triggers auto-log sensitive INSERT/UPDATE changes (staff
 *     activate/deactivate/role, sale status, medical note added).
 *  3. purge_patient() is manager-gated, anonymizes PII, erases clinical
 *     notes, and records a patient_purged audit entry.
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
    "⚠ Supabase env vars missing (.env.local) — audit RLS tests SKIPPED. " +
      "M8 is not Done until these pass against a real project."
  );
}

const PASSWORD = "audit-Passw0rd!";
const run = randomUUID().slice(0, 8);

let admin: SupabaseClient;
const seeded = {} as {
  clinicA: string;
  clinicB: string;
  patientA: string;
  patientB: string;
  saleA: string;
};
const users = {} as Record<
  "ownerA" | "adminA" | "receptionistA" | "practitionerA" | "ownerB",
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
  const email = `aud-${label}-${run}@example.com`;
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

async function auditRows(clinicId: string, action?: string) {
  let q = admin.from("audit_log").select("action, user_id, entity_id").eq("clinic_id", clinicId);
  if (action) q = q.eq("action", action);
  const { data } = await q;
  return data ?? [];
}

describe.skipIf(!hasEnv)("audit log & data rights (M8)", () => {
  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: clinics } = await admin
      .from("clinics")
      .insert([
        { name: `Aud A ${run}`, slug: `aud-a-${run}` },
        { name: `Aud B ${run}`, slug: `aud-b-${run}` },
      ])
      .select("id");
    seeded.clinicA = clinics![0].id;
    seeded.clinicB = clinics![1].id;

    users.ownerA = await createStaff(seeded.clinicA, "owner", "owner-a");
    users.adminA = await createStaff(seeded.clinicA, "admin", "admin-a");
    users.receptionistA = await createStaff(seeded.clinicA, "receptionist", "recep-a");
    users.practitionerA = await createStaff(seeded.clinicA, "practitioner", "pract-a");
    users.ownerB = await createStaff(seeded.clinicB, "owner", "owner-b");

    const { data: patients } = await admin
      .from("patients")
      .insert([
        { clinic_id: seeded.clinicA, name: "Aud Patient A", phone: "0791111111", email: "p@a.test" },
        { clinic_id: seeded.clinicB, name: "Aud Patient B" },
      ])
      .select("id, clinic_id");
    seeded.patientA = patients!.find((p) => p.clinic_id === seeded.clinicA)!.id;
    seeded.patientB = patients!.find((p) => p.clinic_id === seeded.clinicB)!.id;

    const { data: sale } = await admin
      .from("sales")
      .insert({ clinic_id: seeded.clinicA, patient_id: seeded.patientA, total: 100, status: "paid" })
      .select("id")
      .single();
    seeded.saleA = sale!.id;
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("clinics").delete().in("id", [seeded.clinicA, seeded.clinicB]);
    for (const { id } of Object.values(users)) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  // ---------------------------------------------------------
  // RLS on audit_log
  // ---------------------------------------------------------

  it("receptionist and practitioner cannot read the audit log", async () => {
    for (const who of ["receptionistA", "practitionerA"] as const) {
      const client = await signIn(users[who].email);
      const { data } = await client.from("audit_log").select("id");
      expect(data, `${who} should see no audit rows`).toEqual([]);
    }
  });

  it("owner and admin can read the audit log", async () => {
    // Generate at least one entry (medical note added by owner).
    const owner = await signIn(users.ownerA.email);
    await owner.from("patient_medical_notes").insert({
      clinic_id: seeded.clinicA,
      patient_id: seeded.patientA,
      note: "audit seed note",
    });

    for (const who of ["ownerA", "adminA"] as const) {
      const client = await signIn(users[who].email);
      const { data, error } = await client.from("audit_log").select("id");
      expect(error, `${who} read`).toBeNull();
      expect(data!.length).toBeGreaterThan(0);
    }
  });

  it("audit log is append-only (no update or delete)", async () => {
    const owner = await signIn(users.ownerA.email);
    const { data: rows } = await owner.from("audit_log").select("id").limit(1);
    const id = rows![0].id;

    const { data: updated } = await owner
      .from("audit_log")
      .update({ action: "tampered" })
      .eq("id", id)
      .select();
    expect(updated).toEqual([]);

    const { data: deleted } = await owner
      .from("audit_log")
      .delete()
      .eq("id", id)
      .select();
    expect(deleted).toEqual([]);
  });

  it("clinic A manager cannot read clinic B's audit rows", async () => {
    // seed a B entry
    const ownerB = await signIn(users.ownerB.email);
    await ownerB.from("patient_medical_notes").insert({
      clinic_id: seeded.clinicB,
      patient_id: seeded.patientB,
      note: "B note",
    });

    const ownerA = await signIn(users.ownerA.email);
    const { data } = await ownerA.from("audit_log").select("clinic_id");
    for (const row of data ?? []) {
      expect(row.clinic_id).toBe(seeded.clinicA);
    }
  });

  // ---------------------------------------------------------
  // Triggers
  // ---------------------------------------------------------

  it("deactivating a staff member is auto-logged", async () => {
    const owner = await signIn(users.ownerA.email);
    await owner
      .from("users")
      .update({ is_active: false })
      .eq("id", users.practitionerA.id);

    const rows = await auditRows(seeded.clinicA, "staff_deactivated");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.user_id === users.ownerA.id)).toBe(true);

    await admin.from("users").update({ is_active: true }).eq("id", users.practitionerA.id);
  });

  it("changing a sale's status is auto-logged", async () => {
    const owner = await signIn(users.ownerA.email);
    await owner.from("sales").update({ status: "refunded" }).eq("id", seeded.saleA);

    const rows = await auditRows(seeded.clinicA, "sale_status_changed");
    expect(rows.some((r) => r.entity_id === seeded.saleA)).toBe(true);
  });

  it("adding a medical note is auto-logged", async () => {
    const rows = await auditRows(seeded.clinicA, "medical_note_added");
    expect(rows.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------
  // purge_patient()
  // ---------------------------------------------------------

  it("receptionist cannot purge a patient", async () => {
    const recep = await signIn(users.receptionistA.email);
    const { error } = await recep.rpc("purge_patient", { p_patient_id: seeded.patientA });
    expect(error).not.toBeNull();
  });

  it("a manager cannot purge another clinic's patient", async () => {
    const ownerA = await signIn(users.ownerA.email);
    const { error } = await ownerA.rpc("purge_patient", { p_patient_id: seeded.patientB });
    expect(error).not.toBeNull();
  });

  it("owner purge anonymizes PII, erases notes, and is logged", async () => {
    const owner = await signIn(users.ownerA.email);
    const { error } = await owner.rpc("purge_patient", { p_patient_id: seeded.patientA });
    expect(error).toBeNull();

    const { data: patient } = await admin
      .from("patients")
      .select("name, phone, email, purged_at")
      .eq("id", seeded.patientA)
      .single();
    expect(patient!.name).toBe("[purged]");
    expect(patient!.phone).toBeNull();
    expect(patient!.email).toBeNull();
    expect(patient!.purged_at).not.toBeNull();

    const { data: notes } = await admin
      .from("patient_medical_notes")
      .select("id")
      .eq("patient_id", seeded.patientA);
    expect(notes).toEqual([]);

    const purged = await auditRows(seeded.clinicA, "patient_purged");
    expect(purged.some((r) => r.entity_id === seeded.patientA)).toBe(true);
  });
});
