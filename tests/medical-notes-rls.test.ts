/**
 * M1 — medical notes access control (Definition of Done).
 *
 * The receptionist must not be able to fetch, insert, or update
 * medical notes — while still being able to work with the patient's
 * general record. Owner and practitioner keep full note access.
 *
 * Requires a real Supabase project with migrations applied
 * (.env.local) — self-skips otherwise. Run: npm run test:isolation
 * or: npx vitest run tests/medical-notes-rls.test.ts
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
    "⚠ Supabase env vars missing (.env.local) — medical-notes RLS tests SKIPPED. " +
      "M1 is not Done until these pass against a real project."
  );
}

const PASSWORD = "medical-notes-Passw0rd!";
const run = randomUUID().slice(0, 8);

let admin: SupabaseClient;
let clinicId: string;
let patientId: string;
let noteId: string;
const users = {} as Record<
  "owner" | "receptionist" | "practitioner",
  { id: string; email: string }
>;

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

describe.skipIf(!hasEnv)("medical notes RLS (M1)", () => {
  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: clinic, error: clinicError } = await admin
      .from("clinics")
      .insert({ name: `MedNotes Clinic ${run}`, slug: `mednotes-${run}` })
      .select("id")
      .single();
    if (clinicError) throw new Error(clinicError.message);
    clinicId = clinic.id;

    for (const role of ["owner", "receptionist", "practitioner"] as const) {
      const email = `mednotes-${role}-${run}@example.com`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw new Error(`createUser ${role}: ${error.message}`);
      const { error: profileError } = await admin.from("users").insert({
        id: data.user.id,
        clinic_id: clinicId,
        role,
        name: `${role} test`,
        email,
      });
      if (profileError) throw new Error(profileError.message);
      users[role] = { id: data.user.id, email };
    }

    const { data: patient, error: patientError } = await admin
      .from("patients")
      .insert({
        clinic_id: clinicId,
        name: "Med Notes Patient",
        phone: "0790000000",
        consent_at: new Date().toISOString(),
        consent_version: "test",
      })
      .select("id")
      .single();
    if (patientError) throw new Error(patientError.message);
    patientId = patient.id;

    const { data: note, error: noteError } = await admin
      .from("patient_medical_notes")
      .insert({
        clinic_id: clinicId,
        patient_id: patientId,
        author_id: users.practitioner.id,
        note: "Sensitive medical history",
      })
      .select("id")
      .single();
    if (noteError) throw new Error(noteError.message);
    noteId = note.id;
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("clinics").delete().eq("id", clinicId);
    for (const { id } of Object.values(users)) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("receptionist cannot fetch medical notes (list or by id)", async () => {
    const recep = await signIn(users.receptionist.email);

    const { data: all, error } = await recep
      .from("patient_medical_notes")
      .select("*");
    expect(error).toBeNull();
    expect(all).toEqual([]);

    const { data: byId } = await recep
      .from("patient_medical_notes")
      .select("*")
      .eq("id", noteId);
    expect(byId).toEqual([]);

    const { data: byPatient } = await recep
      .from("patient_medical_notes")
      .select("*")
      .eq("patient_id", patientId);
    expect(byPatient).toEqual([]);
  });

  it("receptionist cannot insert a medical note", async () => {
    const recep = await signIn(users.receptionist.email);
    const { error } = await recep.from("patient_medical_notes").insert({
      clinic_id: clinicId,
      patient_id: patientId,
      note: "receptionist should not write this",
    });
    expect(error).not.toBeNull();
  });

  it("receptionist cannot update or delete an existing medical note", async () => {
    const recep = await signIn(users.receptionist.email);

    const { data: updated } = await recep
      .from("patient_medical_notes")
      .update({ note: "tampered" })
      .eq("id", noteId)
      .select();
    expect(updated).toEqual([]);

    const { data: deleted } = await recep
      .from("patient_medical_notes")
      .delete()
      .eq("id", noteId)
      .select();
    expect(deleted).toEqual([]);

    const { data: intact } = await admin
      .from("patient_medical_notes")
      .select("note")
      .eq("id", noteId)
      .single();
    expect(intact?.note).toBe("Sensitive medical history");
  });

  it("receptionist can still read and update the general patient record", async () => {
    const recep = await signIn(users.receptionist.email);

    const { data: patient, error } = await recep
      .from("patients")
      .select("id, name, notes")
      .eq("id", patientId)
      .single();
    expect(error).toBeNull();
    expect(patient?.id).toBe(patientId);

    const { data: updated, error: updateError } = await recep
      .from("patients")
      .update({ notes: "general note from reception" })
      .eq("id", patientId)
      .select("notes")
      .single();
    expect(updateError).toBeNull();
    expect(updated?.notes).toBe("general note from reception");
  });

  it("owner and practitioner can read and add medical notes", async () => {
    for (const who of ["owner", "practitioner"] as const) {
      const client = await signIn(users[who].email);

      const { data, error } = await client
        .from("patient_medical_notes")
        .select("id, note")
        .eq("patient_id", patientId);
      expect(error, `${who} select`).toBeNull();
      expect(data!.length).toBeGreaterThan(0);

      const { error: insertError } = await client
        .from("patient_medical_notes")
        .insert({
          clinic_id: clinicId,
          patient_id: patientId,
          author_id: users[who].id,
          note: `note by ${who}`,
        });
      expect(insertError, `${who} insert`).toBeNull();
    }
  });
});
