/**
 * M6 — reports & dashboard stats (Definition of Done).
 *
 *  1. get_dashboard_stats() is manager-only: a receptionist calling the
 *     RPC directly gets an error (DB-level gating, not just UI).
 *  2. Strict isolation: each clinic's numbers contain only its own data
 *     (checked in both directions).
 *  3. Aggregates are correct: revenue (refunds excluded) + previous
 *     period, no-show counts, new-vs-returning visitors, top services,
 *     practitioner performance.
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
    "⚠ Supabase env vars missing (.env.local) — reports RLS tests SKIPPED. " +
      "M6 is not Done until these pass against a real project."
  );
}

const PASSWORD = "reports-Passw0rd!";
const run = randomUUID().slice(0, 8);

// Fixed reporting window + its predecessor.
const FROM = "2026-06-01";
const TO = "2026-06-30";
const PREV_DATE = "2026-05-15";

let admin: SupabaseClient;
const seeded = {} as {
  clinicA: string;
  clinicB: string;
  patient1: string; // returning: visited before + in period
  patient2: string; // new: first visit in period
  serviceA: string;
};
const users = {} as Record<
  "ownerA" | "receptionistA" | "practitionerA" | "ownerB",
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
  const email = `rpt-${label}-${run}@example.com`;
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

describe.skipIf(!hasEnv)("reports & dashboard stats (M6)", () => {
  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: clinics } = await admin
      .from("clinics")
      .insert([
        { name: `Rpt A ${run}`, slug: `rpt-a-${run}` },
        { name: `Rpt B ${run}`, slug: `rpt-b-${run}` },
      ])
      .select("id");
    seeded.clinicA = clinics![0].id;
    seeded.clinicB = clinics![1].id;

    users.ownerA = await createStaff(seeded.clinicA, "owner", "owner-a");
    users.receptionistA = await createStaff(seeded.clinicA, "receptionist", "recep-a");
    users.practitionerA = await createStaff(seeded.clinicA, "practitioner", "pract-a");
    users.ownerB = await createStaff(seeded.clinicB, "owner", "owner-b");

    const { data: patients } = await admin
      .from("patients")
      .insert([
        { clinic_id: seeded.clinicA, name: "Rpt P1", source: "instagram" },
        { clinic_id: seeded.clinicA, name: "Rpt P2", source: "friend" },
        { clinic_id: seeded.clinicB, name: "Rpt PB" },
      ])
      .select("id, name");
    seeded.patient1 = patients!.find((p) => p.name === "Rpt P1")!.id;
    seeded.patient2 = patients!.find((p) => p.name === "Rpt P2")!.id;
    const patientB = patients!.find((p) => p.name === "Rpt PB")!.id;

    const { data: svc } = await admin
      .from("services")
      .insert({ clinic_id: seeded.clinicA, name: "Rpt Svc", price: 100 })
      .select("id")
      .single();
    seeded.serviceA = svc!.id;

    // --- Sales in clinic A: 100 + 50 in period, 999 refunded (excluded),
    //     30 in the previous period. Clinic B: 777 in period.
    const { data: sales } = await admin
      .from("sales")
      .insert([
        { clinic_id: seeded.clinicA, patient_id: seeded.patient1, sale_date: "2026-06-10", total: 100, status: "paid" },
        { clinic_id: seeded.clinicA, patient_id: seeded.patient2, sale_date: "2026-06-20", total: 50, status: "paid" },
        { clinic_id: seeded.clinicA, patient_id: seeded.patient1, sale_date: "2026-06-15", total: 999, status: "refunded" },
        { clinic_id: seeded.clinicA, patient_id: seeded.patient1, sale_date: PREV_DATE, total: 30, status: "paid" },
        { clinic_id: seeded.clinicB, patient_id: patientB, sale_date: "2026-06-12", total: 777, status: "paid" },
      ])
      .select("id, total, status");

    const sale100 = sales!.find((s) => Number(s.total) === 100)!.id;
    const sale50 = sales!.find((s) => Number(s.total) === 50)!.id;
    await admin.from("sale_items").insert([
      { clinic_id: seeded.clinicA, sale_id: sale100, service_id: seeded.serviceA, practitioner_id: users.practitionerA.id, price: 100, quantity: 1 },
      { clinic_id: seeded.clinicA, sale_id: sale50, service_id: seeded.serviceA, practitioner_id: users.practitionerA.id, price: 50, quantity: 1 },
    ]);

    // --- Appointments in period: 3 completed, 1 no-show (no practitioner
    //     → the overlap constraint never applies; statuses set on insert
    //     so the visit-on-completion trigger doesn't fire).
    await admin.from("appointments").insert(
      [
        ["2026-06-02T09:00:00Z", "completed"],
        ["2026-06-03T09:00:00Z", "completed"],
        ["2026-06-04T09:00:00Z", "completed"],
        ["2026-06-05T09:00:00Z", "no_show"],
      ].map(([start, status]) => ({
        clinic_id: seeded.clinicA,
        patient_id: seeded.patient1,
        start_at: start,
        end_at: start.replace("09:00", "09:30"),
        status,
      }))
    );

    // --- Visits (service_id null → no follow-up trigger side effects):
    //     P1 visited before AND in period (returning); P2 only in period (new).
    await admin.from("visits").insert([
      { clinic_id: seeded.clinicA, patient_id: seeded.patient1, visit_date: "2026-03-10" },
      { clinic_id: seeded.clinicA, patient_id: seeded.patient1, visit_date: "2026-06-10" },
      { clinic_id: seeded.clinicA, patient_id: seeded.patient2, visit_date: "2026-06-20" },
    ]);
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("clinics").delete().in("id", [seeded.clinicA, seeded.clinicB]);
    for (const { id } of Object.values(users)) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("receptionist cannot call get_dashboard_stats (manager-only at DB level)", async () => {
    const recep = await signIn(users.receptionistA.email);
    const { data, error } = await recep.rpc("get_dashboard_stats", {
      p_from: FROM,
      p_to: TO,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("owner gets correct revenue: refunds excluded, previous period computed", async () => {
    const owner = await signIn(users.ownerA.email);
    const { data, error } = await owner.rpc("get_dashboard_stats", {
      p_from: FROM,
      p_to: TO,
    });
    expect(error).toBeNull();
    expect(Number(data.revenue.current)).toBe(150); // 100 + 50, not 999
    expect(Number(data.revenue.previous)).toBe(30);
  });

  it("numbers are strictly clinic-isolated (both directions)", async () => {
    const ownerA = await signIn(users.ownerA.email);
    const { data: a } = await ownerA.rpc("get_dashboard_stats", {
      p_from: FROM,
      p_to: TO,
    });
    expect(Number(a.revenue.current)).toBe(150); // no 777 from B

    const ownerB = await signIn(users.ownerB.email);
    const { data: b } = await ownerB.rpc("get_dashboard_stats", {
      p_from: FROM,
      p_to: TO,
    });
    expect(Number(b.revenue.current)).toBe(777); // no 150 from A
    expect(b.top_services).toEqual([]); // B has no sale_items
  });

  it("computes appointment outcomes for the no-show rate", async () => {
    const owner = await signIn(users.ownerA.email);
    const { data } = await owner.rpc("get_dashboard_stats", {
      p_from: FROM,
      p_to: TO,
    });
    expect(data.appointments.completed).toBe(3);
    expect(data.appointments.no_show).toBe(1);
    expect(data.appointments.total).toBe(4);
  });

  it("classifies new vs returning visitors by first-ever visit", async () => {
    const owner = await signIn(users.ownerA.email);
    const { data } = await owner.rpc("get_dashboard_stats", {
      p_from: FROM,
      p_to: TO,
    });
    expect(data.patients.visitors_returning).toBe(1); // P1 (first visit in March)
    expect(data.patients.visitors_new).toBe(1); // P2
  });

  it("reports top services and practitioner performance", async () => {
    const owner = await signIn(users.ownerA.email);
    const { data } = await owner.rpc("get_dashboard_stats", {
      p_from: FROM,
      p_to: TO,
    });

    const top = data.top_services.find((s: { name: string }) => s.name === "Rpt Svc");
    expect(top).toBeTruthy();
    expect(Number(top.revenue)).toBe(150);
    expect(Number(top.volume)).toBe(2);

    const pract = data.practitioners.find(
      (p: { name: string }) => p.name === "pract-a"
    );
    expect(pract).toBeTruthy();
    expect(Number(pract.revenue)).toBe(150);
    expect(Number(pract.items)).toBe(2);
  });

  it("returns a 12-point monthly trend including the period's revenue", async () => {
    const owner = await signIn(users.ownerA.email);
    const { data } = await owner.rpc("get_dashboard_stats", {
      p_from: FROM,
      p_to: TO,
    });
    expect(data.trend.length).toBe(12);
    const june = data.trend.find((t: { month: string }) => t.month === "2026-06");
    expect(Number(june.revenue)).toBe(150);
    const may = data.trend.find((t: { month: string }) => t.month === "2026-05");
    expect(Number(may.revenue)).toBe(30);
  });
});
