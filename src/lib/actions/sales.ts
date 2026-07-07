"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { canRecordSales, type PaymentMethod, type SaleStatus } from "@/lib/sales";

/** Error values are translation keys under `sales.errors`. */
export type SaleFormState = {
  error:
    | "patientRequired"
    | "itemsRequired"
    | "paymentRequired"
    | "insufficientSessions"
    | "saveFailed";
} | null;

type LineItem = {
  kind: "service" | "package" | "redeem";
  service_id?: string;
  practitioner_id?: string;
  package_id?: string;
  patient_package_id?: string;
  quantity?: number;
  price?: number;
};

function parseItems(formData: FormData): LineItem[] {
  try {
    const raw = JSON.parse(String(formData.get("items") ?? "[]"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function paidTotal(items: LineItem[]): number {
  return items.reduce((sum, item) => {
    if (item.kind === "service" || item.kind === "package") {
      return sum + (item.price ?? 0) * (item.quantity ?? 1);
    }
    return sum;
  }, 0);
}

export async function recordSale(
  _prevState: SaleFormState,
  formData: FormData
): Promise<SaleFormState> {
  const profile = await getProfile();
  if (!profile || !canRecordSales(profile)) return { error: "saveFailed" };

  const patientId = String(formData.get("patient_id") ?? "").trim();
  if (!patientId) return { error: "patientRequired" };

  const items = parseItems(formData);
  if (items.length === 0) return { error: "itemsRequired" };

  const paymentRaw = String(formData.get("payment_method") ?? "").trim();
  const total = paidTotal(items);
  // A charge needs a payment method; a fully package-covered sale doesn't.
  if (total > 0 && paymentRaw === "") return { error: "paymentRequired" };
  const payment: PaymentMethod | null =
    paymentRaw === "" ? null : (paymentRaw as PaymentMethod);

  const visitRaw = String(formData.get("visit_id") ?? "").trim();
  const status: SaleStatus = "paid";

  const supabase = await createClient();
  const { data: saleId, error } = await supabase.rpc("record_sale", {
    p_patient_id: patientId,
    p_visit_id: visitRaw === "" ? null : visitRaw,
    p_payment_method: payment,
    p_status: status,
    p_sale_date: new Date().toISOString().slice(0, 10),
    p_items: items,
  });

  if (error) {
    if (/insufficient sessions/i.test(error.message)) {
      return { error: "insufficientSessions" };
    }
    return { error: "saveFailed" };
  }

  revalidatePath("/[locale]/sales", "page");
  redirect(`/${await getLocale()}/sales/${saleId}`);
}

export async function setSaleStatus(
  saleId: string,
  status: SaleStatus
): Promise<void> {
  const supabase = await createClient();
  // RLS: only managers can update a sale.
  await supabase.from("sales").update({ status }).eq("id", saleId);
  revalidatePath("/[locale]/sales", "page");
}

export async function deleteSale(saleId: string): Promise<void> {
  const supabase = await createClient();
  // RLS: only managers can delete a sale.
  await supabase.from("sales").delete().eq("id", saleId);
  revalidatePath("/[locale]/sales", "page");
  redirect(`/${await getLocale()}/sales`);
}
