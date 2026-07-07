"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { CalendarCheck, X } from "lucide-react";
import { setFollowupStatus } from "@/lib/actions/followups";
import { Button } from "@/components/ui/button";

export function FollowupActions({ followupId }: { followupId: string }) {
  const t = useTranslations("followups.actions");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(() => setFollowupStatus(followupId, "booked"))}
      >
        <CalendarCheck className="size-4" />
        {t("booked")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("dismiss")}
        disabled={pending}
        onClick={() => startTransition(() => setFollowupStatus(followupId, "dismissed"))}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
