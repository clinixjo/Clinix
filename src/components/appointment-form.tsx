"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { AppointmentFormState } from "@/lib/actions/appointments";
import type { AppointmentRow } from "@/lib/appointments";
import { isoToLocalInput } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Option = { id: string; name: string };

export function AppointmentForm({
  action,
  mode,
  initial,
  defaultDate,
  patients,
  services,
  practitioners,
}: {
  action: (
    prevState: AppointmentFormState,
    formData: FormData
  ) => Promise<AppointmentFormState>;
  mode: "create" | "edit";
  initial?: AppointmentRow;
  defaultDate?: string;
  patients: Option[];
  services: Option[];
  practitioners: Option[];
}) {
  const t = useTranslations("appointments");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState(action, null);

  const defaultStart = initial
    ? isoToLocalInput(initial.start_at)
    : `${defaultDate}T09:00`;

  return (
    <form action={formAction} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "create" ? t("form.bookTitle") : t("form.editTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="patient_id">{t("fields.patient")}</Label>
            <Select name="patient_id" defaultValue={initial?.patient?.id}>
              <SelectTrigger id="patient_id" className="w-full">
                <SelectValue placeholder={t("form.selectPatient")} />
              </SelectTrigger>
              <SelectContent>
                {patients.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="service_id">{t("fields.service")}</Label>
            <Select name="service_id" defaultValue={initial?.service?.id}>
              <SelectTrigger id="service_id" className="w-full">
                <SelectValue placeholder={t("form.selectService")} />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="practitioner_id">{t("fields.practitioner")}</Label>
            <Select
              name="practitioner_id"
              defaultValue={initial?.practitioner?.id ?? "none"}
            >
              <SelectTrigger id="practitioner_id" className="w-full">
                <SelectValue placeholder={t("form.selectPractitioner")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {t("fields.anyPractitioner")}
                </SelectItem>
                {practitioners.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="start_at">
              {t("fields.date")} / {t("fields.time")}
            </Label>
            <Input
              id="start_at"
              name="start_at"
              type="datetime-local"
              dir="ltr"
              required
              defaultValue={defaultStart}
            />
            <p className="text-xs text-muted-foreground">
              {t("form.durationHint")}
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">{t("fields.notes")}</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={initial?.notes ?? ""}
            />
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
          <Link href="/appointments">{tCommon("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
