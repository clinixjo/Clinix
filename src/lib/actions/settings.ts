"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { canEditCatalog } from "@/lib/catalog";
import type { DayHours } from "@/lib/business-hours";

export type ClinicProfileState = {
  ok?: boolean;
  error?: "nameRequired" | "failed";
} | null;

/** Merge a patch into clinics.settings and persist (manager only). */
async function patchSettings(patch: Record<string, unknown>) {
  const profile = await getProfile();
  if (!profile || !canEditCatalog(profile.role)) return false;
  const supabase = await createClient();
  const { error } = await supabase
    .from("clinics")
    .update({ settings: { ...profile.clinic.settings, ...patch } })
    .eq("id", profile.clinic_id);
  return !error;
}

export async function updateClinicProfile(
  _prev: ClinicProfileState,
  formData: FormData
): Promise<ClinicProfileState> {
  const profile = await getProfile();
  if (!profile || !canEditCatalog(profile.role)) return { error: "failed" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "nameRequired" };

  const text = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinics")
    .update({
      name,
      settings: {
        ...profile.clinic.settings,
        tax_id: text("tax_id"),
        contact_phone: text("contact_phone"),
        contact_email: text("contact_email"),
      },
    })
    .eq("id", profile.clinic_id);

  if (error) return { error: "failed" };
  revalidatePath("/[locale]/settings", "layout");
  return { ok: true };
}

export async function updateBusinessHours(hours: DayHours[]): Promise<{ ok: boolean }> {
  const ok = await patchSettings({ business_hours: hours });
  revalidatePath("/[locale]/settings", "page");
  return { ok };
}

export async function setPractitionerCanEdit(value: boolean): Promise<void> {
  await patchSettings({ practitioner_can_edit: value });
  revalidatePath("/[locale]/settings", "page");
}

export async function uploadLogo(formData: FormData): Promise<{ ok: boolean }> {
  const profile = await getProfile();
  if (!profile || !canEditCatalog(profile.role)) return { ok: false };

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { ok: false };
  if (file.size > 2_000_000) return { ok: false }; // 2MB cap

  const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
  const path = `${profile.clinic_id}/logo-${Date.now()}.${ext}`;

  const adminClient = createAdminClient();
  const { error } = await adminClient.storage
    .from("clinic-logos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) return { ok: false };

  const { data: pub } = adminClient.storage.from("clinic-logos").getPublicUrl(path);
  const { error: saveErr } = await adminClient
    .from("clinics")
    .update({ logo_url: pub.publicUrl })
    .eq("id", profile.clinic_id);
  if (saveErr) return { ok: false };

  revalidatePath("/[locale]/settings", "layout");
  return { ok: true };
}

/** Quietly create the first service during onboarding (no redirect). */
export async function onboardingAddService(input: {
  name: string;
  price: number;
  duration_min: number | null;
  followup_interval_days: number | null;
}): Promise<{ ok: boolean }> {
  const profile = await getProfile();
  if (!profile || !canEditCatalog(profile.role)) return { ok: false };
  const name = input.name.trim();
  if (!name || !Number.isFinite(input.price) || input.price < 0) {
    return { ok: false };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("services").insert({
    clinic_id: profile.clinic_id,
    name,
    price: input.price,
    duration_min: input.duration_min,
    followup_interval_days: input.followup_interval_days,
  });
  return { ok: !error };
}

export async function markOnboarded(): Promise<void> {
  await patchSettings({ onboarded: true });
  const locale = await getLocale();
  redirect(`/${locale}/dashboard`);
}
