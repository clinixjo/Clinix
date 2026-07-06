import { cache } from "react";
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
    settings: { practitioner_can_edit?: boolean } & Record<string, unknown>;
  };
};

/**
 * Loads the signed-in user's staff profile (role + clinic).
 * Returns null when not signed in or when no profile row exists.
 * Cached per request.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id, clinic_id, role, name, email, is_active, clinic:clinics(id, name, slug, settings)")
    .eq("id", user.id)
    .single();

  if (!data || !data.is_active) return null;
  return data as unknown as Profile;
});
