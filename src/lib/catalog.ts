import type { Profile } from "@/lib/auth";

/**
 * Catalog (services + packages) is editable by clinic managers only
 * (owner/admin). Everyone else in the clinic is view-only. Mirrors the
 * RLS write policies on services/packages/package_items.
 */
export function canEditCatalog(role: Profile["role"]): boolean {
  return role === "owner" || role === "admin";
}
