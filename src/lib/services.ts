import { createClient } from "@/lib/supabase/server";

export type Service = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  duration_min: number | null;
  price: number;
  tax_rate: number;
  followup_interval_days: number | null;
  is_active: boolean;
};

export async function listServices(): Promise<Service[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select(
      "id, name, description, category, duration_min, price, tax_rate, followup_interval_days, is_active"
    )
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new Error(`listServices: ${error.message}`);
  return (data ?? []) as Service[];
}

/** Active services only — used to populate package line-item pickers. */
export async function listActiveServices(): Promise<
  Pick<Service, "id" | "name" | "price">[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, name, price")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw new Error(`listActiveServices: ${error.message}`);
  return data ?? [];
}

export async function getService(id: string): Promise<Service | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select(
      "id, name, description, category, duration_min, price, tax_rate, followup_interval_days, is_active"
    )
    .eq("id", id)
    .maybeSingle();
  return data as Service | null;
}
