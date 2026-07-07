/**
 * M4 — sales & invoicing (Definition of Done).
 *
 *  1. Tenant isolation on sales / sale_items.
 *  2. Roles: receptionist can record a sale but cannot edit/delete it;
 *     owner/admin can.
 *  3. record_sale() computes the total and, crucially, is ATOMIC:
 *     - a package purchase creates a patient_packages session pool,
 *     - a redemption decrements it,
 *     - an over-redemption raises AND rolls back — no sale row is left
 *       behind and the package counter is untouched.
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
    "⚠ Supabase env vars missing (.env.local) — sales RLS tests SKIPPED. " +
      "M4 is not Done until these pass against a real project."
  );
}

const PASSWORD = "sales-Passw0rd!";
const run = randomUUID().slice(0, 8);

let admin: SupabaseClient;
const seeded = {} as {
  clinicA: string;
  clinicB: string;
  patientA: string;
  patientB: string;
  serviceA: string;
  packageA: string;
  ppRedeemA: string; // patient_package in A with 2 sessions
  ppB: string; // patient_package in B (cross-clinic)
};
const users = {} as Record<
  "ownerA" | "receptionistA" | "ownerB",
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
  const email = `sale-${label}-${run}@example.com`;
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

describe.skipIf(!hasEnv)("sales & atomic package deduction (M4)", () => {
  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: clinics } = await admin
      .from("clinics")
      .insert([
        { name: `Sale A ${run}`, slug: `sale-a-${run}` },
        { name: `Sale B ${run}`, slug: `sale-b-${run}` },
      ])
      .select("id");
    seeded.clinicA = clinics![0].id;
    seeded.clinicB = clinics![1].id;

    users.ownerA = await createStaff(seeded.clinicA, "owner", "owner-a");
    users.receptionistA = await createStaff(seeded.clinicA, "receptionist", "recep-a");
    users.ownerB = await createStaff(seeded.clinicB, "owner", "owner-b");

    const { data: patients } = await admin
      .from("patients")
      .insert([
        { clinic_id: seeded.clinicA, name: "Sale Patient A" },
        { clinic_id: seeded.clinicB, name: "Sale Patient B" },
      ])
      .select("id, clinic_id");
    seeded.patientA = patients!.find((p) => p.clinic_id === seeded.clinicA)!.id;
    seeded.patientB = patients!.find((p) => p.clinic_id === seeded.clinicB)!.id;

    const { data: service } = await admin
      .from("services")
      .insert({ clinic_id: seeded.clinicA, name: "Sale Svc A", price: 120 })
      .select("id")
      .single();
    seeded.serviceA = service!.id;

    const { data: pkg } = await admin
      .from("packages")
      .insert({ clinic_id: seeded.clinicA, name: "Sale Pkg A", price: 300 })
      .select("id")
      .single();
    seeded.packageA = pkg!.id;
    await admin.from("package_items").insert({
      clinic_id: seeded.clinicA,
      package_id: seeded.packageA,
      service_id: seeded.serviceA,
      quantity: 3,
    });

    // A pre-bought package with 2 sessions for redemption tests.
    const { data: pp } = await admin
      .from("patient_packages")
      .insert({
        clinic_id: seeded.clinicA,
        patient_id: seeded.patientA,
        package_id: seeded.packageA,
        total_sessions: 2,
        used_sessions: 0,
      })
      .select("id")
      .single();
    seeded.ppRedeemA = pp!.id;

    const { data: ppb } = await admin
      .from("patient_packages")
      .insert({
        clinic_id: seeded.clinicB,
        patient_id: seeded.patientB,
        package_id: null,
        service_id: null,
        total_sessions: 5,
        used_sessions: 0,
      })
      .select("id")
      .single();
    // service_id/package_id both null violates the check, so give it a service.
    if (!ppb) {
      const { data: svcB } = await admin
        .from("services")
        .insert({ clinic_id: seeded.clinicB, name: "Svc B", price: 10 })
        .select("id")
        .single();
      const { data: ppb2 } = await admin
        .from("patient_packages")
        .insert({
          clinic_id: seeded.clinicB,
          patient_id: seeded.patientB,
          service_id: svcB!.id,
          total_sessions: 5,
          used_sessions: 0,
        })
        .select("id")
        .single();
      seeded.ppB = ppb2!.id;
    } else {
      seeded.ppB = ppb.id;
    }
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("clinics").delete().in("id", [seeded.clinicA, seeded.clinicB]);
    for (const { id } of Object.values(users)) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  async function recordSale(
    client: SupabaseClient,
    items: unknown[],
    overrides: Record<string, unknown> = {}
  ) {
    return client.rpc("record_sale", {
      p_patient_id: seeded.patientA,
      p_visit_id: null,
      p_payment_method: "cash",
      p_status: "paid",
      p_sale_date: "2026-07-08",
      p_items: items,
      ...overrides,
    });
  }

  // ---------------------------------------------------------
  // Recording + totals
  // ---------------------------------------------------------

  it("receptionist can record a sale and the total is computed", async () => {
    const recep = await signIn(users.receptionistA.email);
    const { data: saleId, error } = await recordSale(recep, [
      { kind: "service", service_id: seeded.serviceA, quantity: 2, price: 120 },
    ]);
    expect(error).toBeNull();
    expect(saleId).toBeTruthy();

    const { data: sale } = await admin
      .from("sales")
      .select("total, clinic_id, created_by")
      .eq("id", saleId)
      .single();
    expect(Number(sale!.total)).toBe(240);
    expect(sale!.clinic_id).toBe(seeded.clinicA);
    expect(sale!.created_by).toBe(users.receptionistA.id);
  });

  // ---------------------------------------------------------
  // Tenant isolation + roles
  // ---------------------------------------------------------

  it("clinic B owner cannot see clinic A sales", async () => {
    const recep = await signIn(users.receptionistA.email);
    const { data: saleId } = await recordSale(recep, [
      { kind: "service", service_id: seeded.serviceA, quantity: 1, price: 50 },
    ]);

    const b = await signIn(users.ownerB.email);
    const { data } = await b.from("sales").select("id").eq("id", saleId);
    expect(data).toEqual([]);
  });

  it("receptionist cannot update or delete a sale; owner can", async () => {
    const recep = await signIn(users.receptionistA.email);
    const { data: saleId } = await recordSale(recep, [
      { kind: "service", service_id: seeded.serviceA, quantity: 1, price: 60 },
    ]);

    const { data: recepUpdate } = await recep
      .from("sales")
      .update({ status: "refunded" })
      .eq("id", saleId)
      .select();
    expect(recepUpdate).toEqual([]);

    const { data: recepDelete } = await recep
      .from("sales")
      .delete()
      .eq("id", saleId)
      .select();
    expect(recepDelete).toEqual([]);

    const owner = await signIn(users.ownerA.email);
    const { data: ownerUpdate, error } = await owner
      .from("sales")
      .update({ status: "refunded" })
      .eq("id", saleId)
      .select("status")
      .single();
    expect(error).toBeNull();
    expect(ownerUpdate!.status).toBe("refunded");
  });

  // ---------------------------------------------------------
  // Package purchase + redemption
  // ---------------------------------------------------------

  it("buying a package creates a patient_packages session pool", async () => {
    const recep = await signIn(users.receptionistA.email);
    const { data: saleId, error } = await recordSale(recep, [
      { kind: "package", package_id: seeded.packageA, price: 300 },
    ]);
    expect(error).toBeNull();

    const { data: pp } = await admin
      .from("patient_packages")
      .select("total_sessions, used_sessions")
      .eq("sale_id", saleId)
      .single();
    // package_items summed to 3 sessions
    expect(pp!.total_sessions).toBe(3);
    expect(pp!.used_sessions).toBe(0);
  });

  it("redeeming a session decrements the package counter", async () => {
    const recep = await signIn(users.receptionistA.email);
    const { error } = await recordSale(recep, [
      {
        kind: "redeem",
        service_id: seeded.serviceA,
        quantity: 1,
        patient_package_id: seeded.ppRedeemA,
      },
    ]);
    expect(error).toBeNull();

    const { data: pp } = await admin
      .from("patient_packages")
      .select("used_sessions")
      .eq("id", seeded.ppRedeemA)
      .single();
    expect(pp!.used_sessions).toBe(1);
  });

  // ---------------------------------------------------------
  // Atomicity — the money guarantee
  // ---------------------------------------------------------

  it("over-redeeming raises AND rolls back the whole sale", async () => {
    const recep = await signIn(users.receptionistA.email);

    const { count: before } = await admin
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", seeded.patientA);

    const { data: ppBefore } = await admin
      .from("patient_packages")
      .select("used_sessions")
      .eq("id", seeded.ppRedeemA)
      .single();

    // ppRedeemA has 2 total, 1 used (from previous test) → 1 remaining.
    // Request 5 → must fail.
    const { error } = await recordSale(recep, [
      { kind: "service", service_id: seeded.serviceA, quantity: 1, price: 120 },
      {
        kind: "redeem",
        service_id: seeded.serviceA,
        quantity: 5,
        patient_package_id: seeded.ppRedeemA,
      },
    ]);
    expect(error).not.toBeNull();

    const { count: after } = await admin
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", seeded.patientA);
    // No sale row was left behind — the paid service line rolled back too.
    expect(after).toBe(before);

    const { data: ppAfter } = await admin
      .from("patient_packages")
      .select("used_sessions")
      .eq("id", seeded.ppRedeemA)
      .single();
    expect(ppAfter!.used_sessions).toBe(ppBefore!.used_sessions);
  });

  it("cannot redeem another clinic's package", async () => {
    const recep = await signIn(users.receptionistA.email);
    const { error } = await recordSale(recep, [
      {
        kind: "redeem",
        service_id: seeded.serviceA,
        quantity: 1,
        patient_package_id: seeded.ppB,
      },
    ]);
    expect(error).not.toBeNull();
  });
});
