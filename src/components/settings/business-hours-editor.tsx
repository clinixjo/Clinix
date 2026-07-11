"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateBusinessHours } from "@/lib/actions/settings";
import type { DayHours } from "@/lib/business-hours";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function weekdayName(day: number, locale: string): string {
  // 2026-02-01 is a Sunday → day index maps cleanly.
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 1, 1 + day)));
}

export function BusinessHoursEditor({ initial }: { initial: DayHours[] }) {
  const t = useTranslations("settings.hours");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [hours, setHours] = useState<DayHours[]>(initial);
  const [pending, startTransition] = useTransition();

  function patch(day: number, next: Partial<DayHours>) {
    setHours((hs) => hs.map((h) => (h.day === day ? { ...h, ...next } : h)));
  }

  function save() {
    startTransition(async () => {
      const res = await updateBusinessHours(hours);
      if (res.ok) toast.success(tCommon("save"));
    });
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {hours.map((h) => (
          <li key={h.day} className="flex flex-wrap items-center gap-3">
            <span className="w-24 shrink-0 text-sm font-medium">
              {weekdayName(h.day, locale)}
            </span>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={h.closed}
                onCheckedChange={(v) => patch(h.day, { closed: Boolean(v) })}
              />
              {t("closed")}
            </label>
            {!h.closed ? (
              <div className="flex items-center gap-2">
                <Label className="sr-only">{t("open")}</Label>
                <Input
                  type="time"
                  dir="ltr"
                  value={h.open}
                  onChange={(e) => patch(h.day, { open: e.target.value })}
                  className="w-28"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="time"
                  dir="ltr"
                  value={h.close}
                  onChange={(e) => patch(h.day, { close: e.target.value })}
                  className="w-28"
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <Button size="sm" onClick={save} disabled={pending}>
        {t("save")}
      </Button>
    </div>
  );
}
