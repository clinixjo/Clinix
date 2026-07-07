"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ServiceFormState } from "@/lib/actions/services";
import type { Service } from "@/lib/services";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ServiceForm({
  action,
  initial,
  mode,
}: {
  action: (
    prevState: ServiceFormState,
    formData: FormData
  ) => Promise<ServiceFormState>;
  initial?: Service;
  mode: "create" | "edit";
}) {
  const t = useTranslations("services");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "create" ? t("form.createTitle") : t("form.editTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">{t("fields.name")}</Label>
            <Input id="name" name="name" required defaultValue={initial?.name ?? ""} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">{t("fields.description")}</Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={initial?.description ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">{t("fields.category")}</Label>
            <Input
              id="category"
              name="category"
              defaultValue={initial?.category ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration_min">{t("fields.durationMin")}</Label>
            <Input
              id="duration_min"
              name="duration_min"
              type="number"
              inputMode="numeric"
              min={1}
              dir="ltr"
              defaultValue={initial?.duration_min ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">{t("fields.price")}</Label>
            <Input
              id="price"
              name="price"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              dir="ltr"
              required
              defaultValue={initial?.price ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax_rate">{t("fields.taxRate")}</Label>
            <Input
              id="tax_rate"
              name="tax_rate"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              dir="ltr"
              defaultValue={initial?.tax_rate ?? 0}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="followup_interval_days">
              {t("fields.followupIntervalDays")}
            </Label>
            <Input
              id="followup_interval_days"
              name="followup_interval_days"
              type="number"
              inputMode="numeric"
              min={1}
              dir="ltr"
              defaultValue={initial?.followup_interval_days ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              {t("fields.followupHint")}
            </p>
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <Checkbox
              id="is_active"
              name="is_active"
              defaultChecked={initial?.is_active ?? true}
            />
            <Label htmlFor="is_active">{t("fields.isActive")}</Label>
          </div>
        </CardContent>
      </Card>

      {state?.error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {t(`form.${state.error}`)}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/services">{tCommon("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
