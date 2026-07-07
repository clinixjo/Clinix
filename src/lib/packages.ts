import { createClient } from "@/lib/supabase/server";

export type PackageItem = {
  id: string;
  service_id: string;
  quantity: number;
  service: { id: string; name: string; price: number } | null;
};

export type PackageListItem = {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
  itemCount: number;
  totalValue: number;
};

export type PackageDetail = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_active: boolean;
  items: PackageItem[];
};

type RawItem = { quantity: number; service: { price: number } | null };

/** Sum of member service prices × quantity — the bundle's "value". */
function sumValue(items: RawItem[]): number {
  return items.reduce(
    (total, item) => total + (item.service?.price ?? 0) * item.quantity,
    0
  );
}

export async function listPackages(): Promise<PackageListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("packages")
    .select(
      "id, name, price, is_active, package_items(quantity, service:services(price))"
    )
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new Error(`listPackages: ${error.message}`);

  return (data ?? []).map((pkg) => {
    const items = (pkg.package_items ?? []) as unknown as RawItem[];
    return {
      id: pkg.id,
      name: pkg.name,
      price: pkg.price,
      is_active: pkg.is_active,
      itemCount: items.length,
      totalValue: sumValue(items),
    };
  });
}

export async function getPackage(id: string): Promise<PackageDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("packages")
    .select(
      "id, name, description, price, is_active, package_items(id, service_id, quantity, service:services(id, name, price))"
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    price: data.price,
    is_active: data.is_active,
    items: (data.package_items ?? []) as unknown as PackageItem[],
  };
}
