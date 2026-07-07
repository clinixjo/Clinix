"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, MessageCircle } from "lucide-react";
import {
  logFollowupContact,
  logPackageContact,
} from "@/lib/actions/followups";
import { Button } from "@/components/ui/button";

/**
 * One-click concierge outreach: opens the wa.me link in the same user
 * gesture (so it's never popup-blocked), then logs the message and —
 * for service follow-ups — marks it contacted. The button then shows a
 * satisfying "Contacted" state to guard against double-messaging.
 */
export function WhatsAppButton({
  waLink,
  body,
  patientId,
  followupId,
  initialContacted = false,
}: {
  waLink: string | null;
  body: string;
  patientId: string;
  /** present for service follow-ups; omit for package reminders */
  followupId?: string;
  initialContacted?: boolean;
}) {
  const t = useTranslations("followups.actions");
  const [contacted, setContacted] = useState(initialContacted);
  const [pending, startTransition] = useTransition();

  if (!waLink) {
    return (
      <span className="text-xs text-muted-foreground">{t("noContact")}</span>
    );
  }

  function handleClick() {
    // Open first, within the click gesture, so popup blockers don't fire.
    window.open(waLink!, "_blank", "noopener,noreferrer");
    setContacted(true);
    startTransition(async () => {
      if (followupId) {
        await logFollowupContact(followupId, patientId, body);
      } else {
        await logPackageContact(patientId, body);
      }
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={contacted ? "secondary" : "default"}
      onClick={handleClick}
      disabled={pending}
      className={contacted ? "text-success-fg" : undefined}
    >
      {contacted ? (
        <>
          <Check className="size-4" />
          {t("contacted")}
        </>
      ) : (
        <>
          <MessageCircle className="size-4" />
          {t("sendWhatsapp")}
        </>
      )}
    </Button>
  );
}
