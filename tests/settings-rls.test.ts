/**
 * M7 — settings & team management access control (Definition of Done).
 *
 *  1. Only managers (owner/admin) can update the clinic row/settings;
 *     receptionists and practitioners cannot.
 *  2. Only managers can change a user's role / is_active; and never
 *     across clinics.
 *  3. The users insert policy forbids creating a second owner and
 *     forbids non-managers from adding staff.
 *
 * (Invites and logo uploads run through service-role server actions
 * whose manager/clinic guards are exercised in the app; here we prove
 * the RLS backstop that protects users/clinics for every other path.)
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
    "⚠ Supabase env vars missing (.env.local) — settings RLS tests SKIPPED. " +
      "M7 is not Done until these pass against a real project."
  );
}

const PASSWORD = "settings-Passw0rd!";
const run = randomUUID().slice(0, 8);

let admin: SupabaseClient;
const seeded = {} as { clinicA: string; clinicB: string };
const users = {} as Record<
  "ownerA" | "adminA" | "receptionistA" | "practitionerA" | "ownerB",
  { id: string; email: string }
>;
let pendingAuthId: string; // auth user with no profile, for insert tests

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

async function createStaff(clinicId: string, role: string, label: string) {
  const email = `set-${label}-${run}@example.com`;
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

describe.skipIf(!hasEnv)("settings & team RLS (M7)", () => {
  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: clinics } = await admin
      .from("clinics")
      .insert([
        { name: `Set A ${run}`, slug: `set-a-${run}` },
        { name: `Set B ${run}`, slug: `set-b-${run}` },
      ])
      .select("id");
    seeded.clinicA = clinics![0].id;
    seeded.clinicB = clinics![1].id;

    users.ownerA = await createStaff(seeded.clinicA, "owner", "owner-a");
    users.adminA = await createStaff(seeded.clinicA, "admin", "admin-a");
    users.receptionistA = await createStaff(seeded.clinicA, "receptionist", "recep-a");
    users.practitionerA = await createStaff(seeded.clinicA, "practitioner", "pract-a");
    users.ownerB = await createStaff(seeded.clinicB, "owner", "owner-b");

    const { data: pending } = await admin.auth.admin.createUser({
      email: `set-pending-${run}@example.com`,
      password: PASSWORD,
      email_confirm: true,
    });
    pendingAuthId = pending.user.id;
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("clinics").delete().in("id", [seeded.clinicA, seeded.clinicB]);
    for (const { id } of Object.values(users)) {
      await admin.auth.admin.deleteUser(id);
    }
    if (pendingAuthId) await admin.auth.admin.deleteUser(pendingAuthId);
  });

  // ---------------------------------------------------------
  // Clinic settings
  // ---------------------------------------------------------

  it("receptionist and practitioner cannot update the clinic", async () => {
    for (const who of ["receptionistA", "practitionerA"] as const) {
      const client = await signIn(users[who].email);
      const { data } = await client
        .from("clinics")
        .update({ settings: { practitioner_can_edit: true, hacked: true } })
        .eq("id", seeded.clinicA)
        .select();
      expect(data, `${who} should not update clinic`).toEqual([]);
    }
  });

  it("owner and admin can update clinic settings", async () => {
    for (const who of ["ownerA", "adminA"] as const) {
      const client = await signIn(users[who].email);
      const { data, error } = await client
        .from("clinics")
        .update({ name: `Set A ${run} by ${who}` })
        .eq("id", seeded.clinicA)
        .select("id");
      expect(error, `${who} update`).toBeNull();
      expect(data!.length).toBe(1);
    }
  });

  it("a manager cannot update another clinic's row", async () => {
    const a = await signIn(users.ownerA.email);
    const { data } = await a
      .from("clinics")
      .update({ name: "hijacked" })
      .eq("id", seeded.clinicB)
      .select();
    expect(data).toEqual([]);
  });

  // ---------------------------------------------------------
  // Team management
  // ---------------------------------------------------------

  it("receptionist cannot change a user's role or is_active", async () => {
    const recep = await signIn(users.receptionistA.email);

    const { data: role } = await recep
      .from("users")
      .update({ role: "admin" })
      .eq("id", users.practitionerA.id)
      .select();
    expect(role).toEqual([]);

    const { data: active } = await recep
      .from("users")
      .update({ is_active: false })
      .eq("id", users.practitionerA.id)
      .select();
    expect(active).toEqual([]);
  });

  it("owner can change a user's role and deactivate them", async () => {
    const owner = await signIn(users.ownerA.email);

    const { data: role, error } = await owner
      .from("users")
      .update({ role: "admin" })
      .eq("id", users.practitionerA.id)
      .select("role")
      .single();
    expect(error).toBeNull();
    expect(role!.role).toBe("admin");

    const { data: active } = await owner
      .from("users")
      .update({ is_active: false })
      .eq("id", users.practitionerA.id)
      .select("is_active")
      .single();
    expect(active!.is_active).toBe(false);

    // restore
    await admin
      .from("users")
      .update({ role: "practitioner", is_active: true })
      .eq("id", users.practitionerA.id);
  });

  it("a manager cannot modify another clinic's users", async () => {
    const a = await signIn(users.ownerA.email);
    const { data } = await a
      .from("users")
      .update({ is_active: false })
      .eq("id", users.ownerB.id)
      .select();
    expect(data).toEqual([]);
  });

  // ---------------------------------------------------------
  // Staff insert policy
  // ---------------------------------------------------------

  it("receptionist cannot add staff; owner cannot mint a second owner; owner can add non-owner", async () => {
    const recep = await signIn(users.receptionistA.email);
    const { error: recepErr } = await recep.from("users").insert({
      id: pendingAuthId,
      clinic_id: seeded.clinicA,
      role: "receptionist",
      name: "Nope",
    });
    expect(recepErr).not.toBeNull();

    const owner = await signIn(users.ownerA.email);
    const { error: ownerRoleErr } = await owner.from("users").insert({
      id: pendingAuthId,
      clinic_id: seeded.clinicA,
      role: "owner",
      name: "Second owner",
    });
    expect(ownerRoleErr).not.toBeNull();

    const { error: okErr } = await owner.from("users").insert({
      id: pendingAuthId,
      clinic_id: seeded.clinicA,
      role: "receptionist",
      name: "New staff",
    });
    expect(okErr).toBeNull();
  });

  it("a manager cannot add a user into another clinic", async () => {
    const a = await signIn(users.ownerA.email);
    const { error } = await a.from("users").insert({
      id: randomUUID(),
      clinic_id: seeded.clinicB,
      role: "receptionist",
      name: "Smuggled",
    });
    expect(error).not.toBeNull();
  });
});
