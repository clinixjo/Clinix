"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { canEditCatalog } from "@/lib/catalog";

/** Error values are translation keys under `services.form`. */
export type ServiceFormState = {
  error: "nameRequired" | "priceInvalid" | "saveFailed";
} | null;

type ServiceFields = {
  name: string;
  description: string | null;
  category: string | null;
  duration_min: number | null;
  price: number;
  tax_rate: number;
  followup_interval_days: number | null;
  is_active: boolean;
};

function readInt(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function readFields(formData: FormData): ServiceFields | "priceInvalid" {
  const text = (key: string): string | null => {
    const value = String(formData.get(key) ?? "").trim();
    return value === "" ? null : value;
  };

  const priceRaw = String(formData.get("price") ?? "").trim();
  const price = Number(priceRaw);
  if (priceRaw === "" || !Number.isFinite(price) || price < 0) {
    return "priceInvalid";
  }

  const taxRaw = String(formData.get("tax_rate") ?? "").trim();
  const tax = taxRaw === "" ? 0 : Number(taxRaw);
  if (!Number.isFinite(tax) || tax < 0 || tax > 100) return "priceInvalid";

  return {
    name: String(formData.get("name") ?? "").trim(),
    description: text("description"),
    category: text("category"),
    duration_min: readInt(formData, "duration_min"),
    price,
    tax_rate: tax,
    followup_interval_days: readInt(formData, "followup_interval_days"),
    is_active: formData.get("is_active") === "on",
  };
}

export async function createService(
  _prevState: ServiceFormState,
  formData: FormData
): Promise<ServiceFormState> {
  const profile = await getProfile();
  if (!profile || !canEditCatalog(profile.role)) return { error: "saveFailed" };

  const fields = readFields(formData);
  if (fields === "priceInvalid") return { error: "priceInvalid" };
  if (!fields.name) return { error: "nameRequired" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .insert({ ...fields, clinic_id: profile.clinic_id });
  if (error) return { error: "saveFailed" };

  revalidatePath("/[locale]/services", "page");
  redirect(`/${await getLocale()}/services`);
}

export async function updateService(
  serviceId: string,
  _prevState: ServiceFormState,
  formData: FormData
): Promise<ServiceFormState> {
  const profile = await getProfile();
  if (!profile || !canEditCatalog(profile.role)) return { error: "saveFailed" };

  const fields = readFields(formData);
  if (fields === "priceInvalid") return { error: "priceInvalid" };
  if (!fields.name) return { error: "nameRequired" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .update(fields)
    .eq("id", serviceId)
    .select("id");
  if (error || !data?.length) return { error: "saveFailed" };

  revalidatePath("/[locale]/services", "page");
  redirect(`/${await getLocale()}/services`);
}

export async function deleteService(serviceId: string): Promise<void> {
  const supabase = await createClient();
  // RLS lets only managers delete; others match no rows.
  await supabase.from("services").delete().eq("id", serviceId);
  revalidatePath("/[locale]/services", "page");
  redirect(`/${await getLocale()}/services`);
}
