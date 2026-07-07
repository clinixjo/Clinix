"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { canEditCatalog } from "@/lib/catalog";

/** Error values are translation keys under `packages.form`. */
export type PackageFormState = {
  error: "nameRequired" | "itemsRequired" | "priceInvalid" | "saveFailed";
} | null;

type ParsedItem = { service_id: string; quantity: number };

/** Line items are submitted as a JSON string in the `items` field. */
function parseItems(formData: FormData): ParsedItem[] {
  try {
    const raw = JSON.parse(String(formData.get("items") ?? "[]"));
    if (!Array.isArray(raw)) return [];
    return raw
      .map((row) => ({
        service_id: String(row.service_id ?? ""),
        quantity: Math.trunc(Number(row.quantity)),
      }))
      .filter(
        (row) =>
          row.service_id !== "" &&
          Number.isFinite(row.quantity) &&
          row.quantity > 0
      );
  } catch {
    return [];
  }
}

type PackageFields = { name: string; description: string | null; price: number; is_active: boolean };

function readFields(formData: FormData): PackageFields | "priceInvalid" {
  const priceRaw = String(formData.get("price") ?? "").trim();
  const price = Number(priceRaw);
  if (priceRaw === "" || !Number.isFinite(price) || price < 0) {
    return "priceInvalid";
  }
  const description = String(formData.get("description") ?? "").trim();
  return {
    name: String(formData.get("name") ?? "").trim(),
    description: description === "" ? null : description,
    price,
    is_active: formData.get("is_active") === "on",
  };
}

export async function createPackage(
  _prevState: PackageFormState,
  formData: FormData
): Promise<PackageFormState> {
  const profile = await getProfile();
  if (!profile || !canEditCatalog(profile.role)) return { error: "saveFailed" };

  const fields = readFields(formData);
  if (fields === "priceInvalid") return { error: "priceInvalid" };
  if (!fields.name) return { error: "nameRequired" };

  const items = parseItems(formData);
  if (items.length === 0) return { error: "itemsRequired" };

  const supabase = await createClient();
  const { data: pkg, error } = await supabase
    .from("packages")
    .insert({ ...fields, clinic_id: profile.clinic_id })
    .select("id")
    .single();
  if (error || !pkg) return { error: "saveFailed" };

  const { error: itemsError } = await supabase.from("package_items").insert(
    items.map((item) => ({
      clinic_id: profile.clinic_id,
      package_id: pkg.id,
      service_id: item.service_id,
      quantity: item.quantity,
    }))
  );
  if (itemsError) {
    // Roll back the orphan package so we don't leave an empty bundle.
    await supabase.from("packages").delete().eq("id", pkg.id);
    return { error: "saveFailed" };
  }

  revalidatePath("/[locale]/packages", "page");
  redirect(`/${await getLocale()}/packages`);
}

export async function updatePackage(
  packageId: string,
  _prevState: PackageFormState,
  formData: FormData
): Promise<PackageFormState> {
  const profile = await getProfile();
  if (!profile || !canEditCatalog(profile.role)) return { error: "saveFailed" };

  const fields = readFields(formData);
  if (fields === "priceInvalid") return { error: "priceInvalid" };
  if (!fields.name) return { error: "nameRequired" };

  const items = parseItems(formData);
  if (items.length === 0) return { error: "itemsRequired" };

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("packages")
    .update(fields)
    .eq("id", packageId)
    .select("id");
  if (error || !updated?.length) return { error: "saveFailed" };

  // Reconcile line items: clear and re-insert the current set.
  const { error: deleteError } = await supabase
    .from("package_items")
    .delete()
    .eq("package_id", packageId);
  if (deleteError) return { error: "saveFailed" };

  const { error: itemsError } = await supabase.from("package_items").insert(
    items.map((item) => ({
      clinic_id: profile.clinic_id,
      package_id: packageId,
      service_id: item.service_id,
      quantity: item.quantity,
    }))
  );
  if (itemsError) return { error: "saveFailed" };

  revalidatePath("/[locale]/packages", "page");
  redirect(`/${await getLocale()}/packages`);
}

export async function deletePackage(packageId: string): Promise<void> {
  const supabase = await createClient();
  // RLS lets only managers delete; cascade removes package_items.
  await supabase.from("packages").delete().eq("id", packageId);
  revalidatePath("/[locale]/packages", "page");
  redirect(`/${await getLocale()}/packages`);
}
