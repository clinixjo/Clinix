import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export type AuditEntry = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  actor: { name: string } | null;
};

/**
 * Append a governance entry. Used by DELETE and app-level operations
 * (INSERT/UPDATE-sensitive changes are captured by DB triggers).
 * Details must stay PII-free — UUIDs / status codes / roles only.
 */
export async function logAudit(
  action: string,
  entity: string,
  entityId: string | null,
  details?: Record<string, unknown>
): Promise<void> {
  const profile = await getProfile();
  if (!profile) return;
  const supabase = await createClient();
  await supabase.from("audit_log").insert({
    clinic_id: profile.clinic_id,
    user_id: profile.id,
    action,
    entity,
    entity_id: entityId,
    details: details ?? null,
  });
}

/** Recent audit entries (RLS restricts to owner/admin of the clinic). */
export async function listAuditLog(): Promise<AuditEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, action, entity, entity_id, details, created_at, actor:user_id(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`listAuditLog: ${error.message}`);

  const one = (rel: unknown) =>
    (Array.isArray(rel) ? rel[0] : rel) as { name: string } | null;
  return (data ?? []).map((r) => ({
    id: r.id,
    action: r.action,
    entity: r.entity,
    entity_id: r.entity_id,
    details: r.details as Record<string, unknown> | null,
    created_at: r.created_at,
    actor: one(r.actor),
  }));
}
