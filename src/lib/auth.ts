import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  clinic_id: string;
  role: "owner" | "admin" | "receptionist" | "practitioner";
  name: string;
  email: string | null;
  is_active: boolean;
  clinic: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    subscription_status: string;
    settings: {
      practitioner_can_edit?: boolean;
      onboarded?: boolean;
    } & Record<string, unknown>;
  };
};

/**
 * Loads the signed-in user's staff profile (role + clinic).
 * Returns null when not signed in or when no profile row exists.
 * Cached per request.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  // The profile is per-request — opt into dynamic rendering before any
  // early return so these routes are never statically prerendered.
  await cookies();

  // Supabase not configured yet (fresh checkout) — behave as signed out.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id, clinic_id, role, name, email, is_active, clinic:clinics(id, name, slug, logo_url, subscription_status, settings)")
    .eq("id", user.id)
    .single();

  if (!data || !data.is_active) return null;
  return data as unknown as Profile;
});
