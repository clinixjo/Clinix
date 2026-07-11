"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { setPractitionerCanEdit } from "@/lib/actions/settings";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function PractitionerPermissionToggle({
  initial,
}: {
  initial: boolean;
}) {
  const t = useTranslations("settings.permissions");
  const [enabled, setEnabled] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setEnabled(next);
    startTransition(() => setPractitionerCanEdit(next));
  }

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3">
        <Checkbox
          checked={enabled}
          disabled={pending}
          onCheckedChange={(v) => toggle(Boolean(v))}
          className="mt-0.5"
        />
        <span>
          <Label className="font-medium">{t("practitionerCanEdit")}</Label>
          <p className="text-sm text-muted-foreground">
            {enabled ? t("onHint") : t("offHint")}
          </p>
        </span>
      </label>
      <p className="flex items-start gap-2 rounded-md bg-secondary p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
        {t("note")}
      </p>
    </div>
  );
}
