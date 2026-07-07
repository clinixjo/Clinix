/**
 * M2 — services & packages access control (Definition of Done).
 *
 *  1. Tenant isolation: a clinic A user can never read or write
 *     clinic B's services, packages, or package_items.
 *  2. Role rules: receptionists are view-only on the catalog;
 *     owners have full CRUD.
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
    "⚠ Supabase env vars missing (.env.local) — services/packages RLS tests SKIPPED. " +
      "M2 is not Done until these pass against a real project."
  );
}

const PASSWORD = "services-packages-Passw0rd!";
const run = randomUUID().slice(0, 8);

let admin: SupabaseClient;
const seeded = {} as {
  clinicA: string;
  clinicB: string;
  serviceA: string;
  serviceB: string;
  packageA: string;
  packageB: string;
};
const users = {} as Record<
  "ownerA" | "receptionistA" | "ownerB",
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

async function createStaff(
  clinicId: string,
  role: string,
  label: string
): Promise<{ id: string; email: string }> {
  const email = `sp-${label}-${run}@example.com`;
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
  if (profileError) throw new Error(`profile ${label}: ${profileError.message}`);
  return { id: data.user.id, email };
}

async function seedClinic(label: string) {
  const { data: clinic, error } = await admin
    .from("clinics")
    .insert({ name: `SP ${label} ${run}`, slug: `sp-${label}-${run}` })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const { data: service, error: serviceError } = await admin
    .from("services")
    .insert({
      clinic_id: clinic.id,
      name: `Service ${label}`,
      price: 120,
      tax_rate: 16,
      duration_min: 30,
    })
    .select("id")
    .single();
  if (serviceError) throw new Error(serviceError.message);

  const { data: pkg, error: pkgError } = await admin
    .from("packages")
    .insert({ clinic_id: clinic.id, name: `Package ${label}`, price: 500 })
    .select("id")
    .single();
  if (pkgError) throw new Error(pkgError.message);

  const { error: itemError } = await admin.from("package_items").insert({
    clinic_id: clinic.id,
    package_id: pkg.id,
    service_id: service.id,
    quantity: 5,
  });
  if (itemError) throw new Error(itemError.message);

  return { clinic: clinic.id, service: service.id, pkg: pkg.id };
}

describe.skipIf(!hasEnv)("services & packages RLS (M2)", () => {
  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const a = await seedClinic("a");
    const b = await seedClinic("b");
    seeded.clinicA = a.clinic;
    seeded.serviceA = a.service;
    seeded.packageA = a.pkg;
    seeded.clinicB = b.clinic;
    seeded.serviceB = b.service;
    seeded.packageB = b.pkg;

    users.ownerA = await createStaff(a.clinic, "owner", "owner-a");
    users.receptionistA = await createStaff(a.clinic, "receptionist", "recep-a");
    users.ownerB = await createStaff(b.clinic, "owner", "owner-b");
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

  it("clinic A user sees only clinic A services/packages/items", async () => {
    const a = await signIn(users.ownerA.email);
    for (const table of ["services", "packages", "package_items"]) {
      const { data, error } = await a.from(table).select("*");
      expect(error, `${table} select`).toBeNull();
      for (const row of data ?? []) {
        expect(
          (row as { clinic_id: string }).clinic_id,
          `${table} leaked clinic B`
        ).toBe(seeded.clinicA);
      }
    }
  });

  it("clinic A user cannot fetch clinic B's service or package by id", async () => {
    const a = await signIn(users.ownerA.email);
    const { data: svc } = await a
      .from("services")
      .select("*")
      .eq("id", seeded.serviceB);
    expect(svc).toEqual([]);
    const { data: pkg } = await a
      .from("packages")
      .select("*")
      .eq("id", seeded.packageB);
    expect(pkg).toEqual([]);
  });

  it("clinic A owner cannot insert a package into clinic B", async () => {
    const a = await signIn(users.ownerA.email);
    const { error } = await a
      .from("packages")
      .insert({ clinic_id: seeded.clinicB, name: "Smuggled", price: 1 });
    expect(error).not.toBeNull();
  });

  it("clinic A owner cannot update or delete clinic B's package", async () => {
    const a = await signIn(users.ownerA.email);

    const { data: updated } = await a
      .from("packages")
      .update({ name: "hijacked" })
      .eq("id", seeded.packageB)
      .select();
    expect(updated).toEqual([]);

    const { data: deleted } = await a
      .from("packages")
      .delete()
      .eq("id", seeded.packageB)
      .select();
    expect(deleted).toEqual([]);
  });

  // ---------------------------------------------------------
  // Role rules — receptionist view-only
  // ---------------------------------------------------------

  it("receptionist can view services and packages", async () => {
    const recep = await signIn(users.receptionistA.email);

    const { data: services, error: sErr } = await recep
      .from("services")
      .select("id");
    expect(sErr).toBeNull();
    expect(services!.length).toBeGreaterThan(0);

    const { data: packages, error: pErr } = await recep
      .from("packages")
      .select("id");
    expect(pErr).toBeNull();
    expect(packages!.length).toBeGreaterThan(0);

    const { data: items, error: iErr } = await recep
      .from("package_items")
      .select("id");
    expect(iErr).toBeNull();
    expect(items!.length).toBeGreaterThan(0);
  });

  it("receptionist cannot create, update, or delete services", async () => {
    const recep = await signIn(users.receptionistA.email);

    const { error: insertErr } = await recep
      .from("services")
      .insert({ clinic_id: seeded.clinicA, name: "Nope", price: 10 });
    expect(insertErr).not.toBeNull();

    const { data: updated } = await recep
      .from("services")
      .update({ price: 999 })
      .eq("id", seeded.serviceA)
      .select();
    expect(updated).toEqual([]);

    const { data: deleted } = await recep
      .from("services")
      .delete()
      .eq("id", seeded.serviceA)
      .select();
    expect(deleted).toEqual([]);
  });

  it("receptionist cannot create, update, or delete packages or items", async () => {
    const recep = await signIn(users.receptionistA.email);

    const { error: pkgErr } = await recep
      .from("packages")
      .insert({ clinic_id: seeded.clinicA, name: "Nope", price: 10 });
    expect(pkgErr).not.toBeNull();

    const { data: pkgUpdated } = await recep
      .from("packages")
      .update({ price: 999 })
      .eq("id", seeded.packageA)
      .select();
    expect(pkgUpdated).toEqual([]);

    const { error: itemErr } = await recep.from("package_items").insert({
      clinic_id: seeded.clinicA,
      package_id: seeded.packageA,
      service_id: seeded.serviceA,
      quantity: 1,
    });
    expect(itemErr).not.toBeNull();
  });

  // ---------------------------------------------------------
  // Role rules — owner full CRUD
  // ---------------------------------------------------------

  it("owner can create, update, and delete a service", async () => {
    const owner = await signIn(users.ownerA.email);

    const { data: created, error: createErr } = await owner
      .from("services")
      .insert({
        clinic_id: seeded.clinicA,
        name: "Owner service",
        price: 80,
        tax_rate: 16,
        followup_interval_days: 270,
      })
      .select("id")
      .single();
    expect(createErr).toBeNull();
    expect(created?.id).toBeTruthy();

    const { data: updated, error: updateErr } = await owner
      .from("services")
      .update({ price: 90 })
      .eq("id", created!.id)
      .select("price")
      .single();
    expect(updateErr).toBeNull();
    expect(Number(updated!.price)).toBe(90);

    const { data: deleted } = await owner
      .from("services")
      .delete()
      .eq("id", created!.id)
      .select();
    expect(deleted!.length).toBe(1);
  });

  it("owner can create a package with items", async () => {
    const owner = await signIn(users.ownerA.email);

    const { data: pkg, error: pkgErr } = await owner
      .from("packages")
      .insert({ clinic_id: seeded.clinicA, name: "Owner bundle", price: 300 })
      .select("id")
      .single();
    expect(pkgErr).toBeNull();

    const { error: itemErr } = await owner.from("package_items").insert({
      clinic_id: seeded.clinicA,
      package_id: pkg!.id,
      service_id: seeded.serviceA,
      quantity: 3,
    });
    expect(itemErr).toBeNull();

    // cascade delete removes items too
    const { data: deleted } = await owner
      .from("packages")
      .delete()
      .eq("id", pkg!.id)
      .select();
    expect(deleted!.length).toBe(1);
  });
});
