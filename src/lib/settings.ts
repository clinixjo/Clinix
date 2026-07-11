import { createClient } from "@/lib/supabase/server";

export type StaffMember = {
  id: string;
  name: string;
  email: string | null;
  role: "owner" | "admin" | "receptionist" | "practitioner";
  is_active: boolean;
};

export async function listStaff(): Promise<StaffMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, is_active")
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listStaff: ${error.message}`);
  return (data ?? []) as StaffMember[];
}
