"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { PatientFormState } from "@/lib/actions/patients";
import type { Patient } from "@/lib/patients";
import { PATIENT_SOURCES } from "@/lib/patient-sources";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function PatientForm({
  action,
  initial,
  mode,
  canWriteMedicalNote = false,
}: {
  action: (
    prevState: PatientFormState,
    formData: FormData
  ) => Promise<PatientFormState>;
  initial?: Patient;
  mode: "create" | "edit";
  /** owner/practitioner only — shows the optional first medical note */
  canWriteMedicalNote?: boolean;
}) {
  const t = useTranslations("patients");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState(action, null);

  const cancelHref =
    mode === "edit" && initial ? `/patients/${initial.id}` : "/patients";

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
            <Input
              id="name"
              name="name"
              required
              defaultValue={initial?.name ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dob">{t("fields.dob")}</Label>
            <Input
              id="dob"
              name="dob"
              type="date"
              dir="ltr"
              defaultValue={initial?.dob ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gender">{t("fields.gender")}</Label>
            <Select name="gender" defaultValue={initial?.gender ?? undefined}>
              <SelectTrigger id="gender" className="w-full">
                <SelectValue placeholder={t("form.selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="female">{t("fields.female")}</SelectItem>
                <SelectItem value="male">{t("fields.male")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsapp">{t("fields.whatsapp")}</Label>
            <Input
              id="whatsapp"
              name="whatsapp"
              type="tel"
              dir="ltr"
              placeholder="07XXXXXXXX"
              defaultValue={initial?.whatsapp ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">{t("fields.phone")}</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              dir="ltr"
              defaultValue={initial?.phone ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t("fields.email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              dir="ltr"
              defaultValue={initial?.email ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">{t("fields.source")}</Label>
            <Select name="source" defaultValue={initial?.source ?? undefined}>
              <SelectTrigger id="source" className="w-full">
                <SelectValue placeholder={t("form.selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {PATIENT_SOURCES.map((source) => (
                  <SelectItem key={source} value={source}>
                    {t(`sources.${source}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("fields.sourceHint")}
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">{t("fields.notes")}</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={initial?.notes ?? ""}
            />
          </div>

          {mode === "create" && canWriteMedicalNote ? (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="medicalNote">
                {t("form.initialMedicalNote")}
              </Label>
              <Textarea id="medicalNote" name="medicalNote" rows={3} />
              <p className="text-xs text-muted-foreground">
                {t("profile.medicalNotesRestricted")}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {mode === "create" ? (
        <Card className="border-brand-100 bg-brand-50/40">
          <CardHeader>
            <CardTitle className="text-base text-brand-800">
              {t("consent.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed">{t("consent.text")}</p>
            <div className="flex items-start gap-3">
              <Checkbox id="consent" name="consent" required />
              <Label htmlFor="consent" className="leading-snug">
                {t("consent.checkboxLabel")}
              </Label>
            </div>
          </CardContent>
        </Card>
      ) : null}

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
          <Link href={cancelHref}>{tCommon("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
