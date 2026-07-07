import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth";

export type PaymentMethod = "cash" | "card" | "transfer" | "other";
export type SaleStatus = "paid" | "partial" | "unpaid" | "refunded";

export type SaleListItem = {
  id: string;
  sale_date: string;
  total: number;
  status: SaleStatus;
  payment_method: PaymentMethod | null;
  patient: { name: string } | null;
};

export type SaleItem = {
  id: string;
  price: number;
  quantity: number;
  service: { name: string } | null;
  package: { name: string } | null;
  practitioner: { name: string } | null;
};

export type SaleDetail = {
  id: string;
  sale_date: string;
  total: number;
  status: SaleStatus;
  payment_method: PaymentMethod | null;
  patient: { id: string; name: string } | null;
  creator: { name: string } | null;
  items: SaleItem[];
};

export type ActivePackage = {
  id: string;
  label: string;
  remaining: number;
};

/**
 * Recording sales follows the same rule as the RLS can_edit_records()
 * helper: owner/admin/receptionist always; practitioner only when the
 * clinic's practitioner_can_edit setting allows it.
 */
export function canRecordSales(profile: Profile): boolean {
  if (profile.role === "practitioner") {
    return profile.clinic.settings.practitioner_can_edit === true;
  }
  return (
    profile.role === "owner" ||
    profile.role === "admin" ||
    profile.role === "receptionist"
  );
}

export function canManageSales(profile: Profile): boolean {
  return profile.role === "owner" || profile.role === "admin";
}

export async function listSales(): Promise<SaleListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales")
    .select("id, sale_date, total, status, payment_method, patient:patients(name)")
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`listSales: ${error.message}`);
  return (data ?? []) as unknown as SaleListItem[];
}

export async function getSale(id: string): Promise<SaleDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sales")
    .select(
      "id, sale_date, total, status, payment_method, patient:patients(id, name), creator:created_by(name), items:sale_items(id, price, quantity, service:services(name), package:packages(name), practitioner:practitioner_id(name))"
    )
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as SaleDetail) ?? null;
}

/** Packages the patient still has sessions on — offered for redemption. */
export async function getActivePackagesForPatient(
  patientId: string
): Promise<ActivePackage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patient_packages")
    .select(
      "id, total_sessions, used_sessions, package:packages(name), service:services(name)"
    )
    .eq("patient_id", patientId)
    .order("purchased_at", { ascending: false });
  if (error) throw new Error(`getActivePackagesForPatient: ${error.message}`);

  // PostgREST embeds can be typed as arrays; normalize to a single row.
  const one = (rel: unknown): { name: string } | null =>
    (Array.isArray(rel) ? rel[0] : rel) as { name: string } | null;

  return (data ?? [])
    .map((pp) => {
      const remaining = pp.total_sessions - pp.used_sessions;
      const name = one(pp.package)?.name ?? one(pp.service)?.name ?? "";
      return { id: pp.id, label: name, remaining };
    })
    .filter((pp) => pp.remaining > 0);
}
