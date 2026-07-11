"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  updateClinicProfile,
  type ClinicProfileState,
} from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClinicProfileForm({
  initial,
}: {
  initial: {
    name: string;
    tax_id: string | null;
    contact_phone: string | null;
    contact_email: string | null;
  };
}) {
  const t = useTranslations("settings.clinic");
  const [state, formAction, pending] = useActionState<ClinicProfileState, FormData>(
    updateClinicProfile,
    null
  );

  useEffect(() => {
    if (state?.ok) toast.success(t("save"));
  }, [state, t]);

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" required defaultValue={initial.name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tax_id">{t("taxId")}</Label>
        <Input id="tax_id" name="tax_id" dir="ltr" defaultValue={initial.tax_id ?? ""} />
        <p className="text-xs text-muted-foreground">{t("taxIdHint")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact_phone">{t("contactPhone")}</Label>
        <Input
          id="contact_phone"
          name="contact_phone"
          type="tel"
          dir="ltr"
          defaultValue={initial.contact_phone ?? ""}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="contact_email">{t("contactEmail")}</Label>
        <Input
          id="contact_email"
          name="contact_email"
          type="email"
          dir="ltr"
          defaultValue={initial.contact_email ?? ""}
        />
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-danger-fg sm:col-span-2">
          {t(state.error === "nameRequired" ? "nameRequired" : "saveFailed")}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
