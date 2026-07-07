"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export type ContactResult = { ok: boolean };

/**
 * Records that a WhatsApp message was sent for a service follow-up:
 * appends to message_log AND marks the follow-up contacted so it
 * leaves the due list (spam protection). The body is the exact text
 * that was opened in wa.me.
 */
export async function logFollowupContact(
  followupId: string,
  patientId: string,
  body: string
): Promise<ContactResult> {
  const profile = await getProfile();
  if (!profile) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.from("message_log").insert({
    clinic_id: profile.clinic_id,
    patient_id: patientId,
    followup_id: followupId,
    type: "service_followup",
    channel: "whatsapp",
    body,
    sent_by: profile.id,
  });
  if (error) return { ok: false };

  await supabase
    .from("followups")
    .update({ status: "contacted" })
    .eq("id", followupId);

  revalidatePath("/[locale]/followups", "page");
  return { ok: true };
}

/** Records a package-reminder WhatsApp message (no follow-up row). */
export async function logPackageContact(
  patientId: string,
  body: string
): Promise<ContactResult> {
  const profile = await getProfile();
  if (!profile) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.from("message_log").insert({
    clinic_id: profile.clinic_id,
    patient_id: patientId,
    type: "package_reminder",
    channel: "whatsapp",
    body,
    sent_by: profile.id,
  });
  if (error) return { ok: false };

  revalidatePath("/[locale]/followups", "page");
  return { ok: true };
}

export async function setFollowupStatus(
  followupId: string,
  status: "booked" | "dismissed"
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("followups").update({ status }).eq("id", followupId);
  revalidatePath("/[locale]/followups", "page");
}
