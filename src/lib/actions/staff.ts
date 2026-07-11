"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { canEditCatalog } from "@/lib/catalog"; // owner/admin check

export type InviteRole = "admin" | "practitioner" | "receptionist";

export type InviteResult =
  | { ok: true; email: string; password: string }
  | { ok: false; error: "notAllowed" | "emailInUse" | "invalid" | "failed" };

function tempPassword(): string {
  // Human-shareable one-time password: e.g. "Clinix-7F3A9C".
  return `Clinix-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/**
 * Creates a staff login + profile scoped to the caller's clinic and
 * returns one-time credentials to share. Uses the service role, so the
 * clinic and role are derived here — never from the browser.
 */
export async function inviteStaff(input: {
  name: string;
  email: string;
  role: InviteRole;
}): Promise<InviteResult> {
  const profile = await getProfile();
  if (!profile || !canEditCatalog(profile.role)) return { ok: false, error: "notAllowed" };

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const role = input.role;
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "invalid" };
  }
  if (!["admin", "practitioner", "receptionist"].includes(role)) {
    return { ok: false, error: "invalid" };
  }

  const adminClient = createAdminClient();
  const password = tempPassword();
  const { data: created, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !created?.user) {
    if (/already|registered|exists/i.test(error?.message ?? "")) {
      return { ok: false, error: "emailInUse" };
    }
    return { ok: false, error: "failed" };
  }

  const { error: profileErr } = await adminClient.from("users").insert({
    id: created.user.id,
    clinic_id: profile.clinic_id, // derived from the authenticated caller
    role,
    name,
    email,
  });
  if (profileErr) {
    // Roll back the orphan auth account so email stays reusable.
    await adminClient.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: "failed" };
  }

  revalidatePath("/[locale]/settings/staff", "page");
  return { ok: true, email, password };
}

async function guardManagerTarget(
  targetId: string
): Promise<{ ok: true; clinicId: string } | { ok: false }> {
  const profile = await getProfile();
  if (!profile || !canEditCatalog(profile.role)) return { ok: false };
  if (targetId === profile.id) return { ok: false }; // never yourself

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("users")
    .select("role")
    .eq("id", targetId)
    .maybeSingle();
  // RLS already scopes to the clinic; block touching the owner.
  if (!target || target.role === "owner") return { ok: false };
  return { ok: true, clinicId: profile.clinic_id };
}

export async function setStaffActive(
  targetId: string,
  active: boolean
): Promise<void> {
  const guard = await guardManagerTarget(targetId);
  if (!guard.ok) return;
  const supabase = await createClient();
  await supabase.from("users").update({ is_active: active }).eq("id", targetId);
  revalidatePath("/[locale]/settings/staff", "page");
}

export async function setStaffRole(
  targetId: string,
  role: InviteRole
): Promise<void> {
  if (!["admin", "practitioner", "receptionist"].includes(role)) return;
  const guard = await guardManagerTarget(targetId);
  if (!guard.ok) return;
  const supabase = await createClient();
  await supabase.from("users").update({ role }).eq("id", targetId);
  revalidatePath("/[locale]/settings/staff", "page");
}
