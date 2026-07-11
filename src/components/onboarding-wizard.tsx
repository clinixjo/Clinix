"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import {
  markOnboarded,
  onboardingAddService,
  updateBusinessHours,
} from "@/lib/actions/settings";
import { inviteStaff, type InviteRole } from "@/lib/actions/staff";
import { DEFAULT_BUSINESS_HOURS, type DayHours } from "@/lib/business-hours";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { LogoUploader } from "@/components/settings/logo-uploader";

const STEP_KEYS = ["clinic", "hours", "service", "staff"] as const;
const ROLES: InviteRole[] = ["admin", "practitioner", "receptionist"];

function weekday(day: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, 1, 1 + day))
  );
}

export function OnboardingWizard({
  clinicName,
  logoUrl,
}: {
  clinicName: string;
  logoUrl: string | null;
}) {
  const t = useTranslations("onboarding");
  const tSettings = useTranslations("settings");
  const tStaff = useTranslations("staff");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState(0); // 0..3
  const [done, setDone] = useState(false);
  const [hours, setHours] = useState<DayHours[]>(DEFAULT_BUSINESS_HOURS);

  // Step 3 — first service
  const [svcName, setSvcName] = useState("");
  const [svcPrice, setSvcPrice] = useState("");
  const [svcDuration, setSvcDuration] = useState("");

  // Step 4 — first staff
  const [stName, setStName] = useState("");
  const [stEmail, setStEmail] = useState("");
  const [stRole, setStRole] = useState<InviteRole | "">("");
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [stError, setStError] = useState<string | null>(null);

  function patchHours(day: number, next: Partial<DayHours>) {
    setHours((hs) => hs.map((h) => (h.day === day ? { ...h, ...next } : h)));
  }

  function next() {
    if (step === 1) {
      startTransition(async () => {
        await updateBusinessHours(hours);
        setStep(2);
      });
      return;
    }
    if (step === 2) {
      const price = Number(svcPrice);
      if (svcName.trim() && Number.isFinite(price)) {
        startTransition(async () => {
          await onboardingAddService({
            name: svcName,
            price,
            duration_min: svcDuration ? Math.trunc(Number(svcDuration)) : null,
            followup_interval_days: null,
          });
          setStep(3);
        });
        return;
      }
      setStep(3);
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  }

  function finishInvite() {
    setStError(null);
    if (!stName.trim() || !stEmail.trim() || !stRole) {
      setStError("invalid");
      return;
    }
    startTransition(async () => {
      const res = await inviteStaff({ name: stName, email: stEmail, role: stRole });
      if (res.ok) {
        setCreds({ email: res.email, password: res.password });
        setDone(true);
      } else {
        setStError(res.error);
      }
    });
  }

  function finish() {
    startTransition(() => markOnboarded());
  }

  if (done) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 py-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-bg">
            <Check className="size-6 text-success-fg" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{t("done.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("done.subtitle")}</p>
          </div>
          {creds ? (
            <div className="rounded-md bg-secondary p-3 text-start">
              <p className="text-xs text-muted-foreground">{tStaff("credentials.hint")}</p>
              <p dir="ltr" className="mt-1 font-medium">{creds.email}</p>
              <p dir="ltr" className="font-mono font-medium">{creds.password}</p>
            </div>
          ) : null}
          <Button onClick={finish} disabled={pending} className="w-full">
            {t("done.goToDashboard")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardContent className="space-y-5 py-6">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("stepOf", { current: step + 1, total: 4 })}</span>
            <span className="font-medium text-foreground">
              {t(`steps.${STEP_KEYS[step]}`)}
            </span>
          </div>
          <div className="flex gap-1.5">
            {STEP_KEYS.map((k, i) => (
              <span
                key={k}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  i <= step ? "bg-brand-400" : "bg-secondary"
                )}
              />
            ))}
          </div>
        </div>

        {/* Step 1 — clinic */}
        {step === 0 ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{t("clinic.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("clinic.hint")}</p>
            </div>
            <LogoUploader clinicName={clinicName} logoUrl={logoUrl} />
            <p className="text-sm">
              <span className="font-medium">{tSettings("clinic.name")}:</span>{" "}
              {clinicName}
            </p>
          </div>
        ) : null}

        {/* Step 2 — hours */}
        {step === 1 ? (
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{t("hours.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("hours.hint")}</p>
            </div>
            <ul className="space-y-2">
              {hours.map((h) => (
                <li key={h.day} className="flex flex-wrap items-center gap-2">
                  <span className="w-20 shrink-0 text-sm">{weekday(h.day, locale)}</span>
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={h.closed}
                      onCheckedChange={(v) => patchHours(h.day, { closed: Boolean(v) })}
                    />
                    {tSettings("hours.closed")}
                  </label>
                  {!h.closed ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="time"
                        dir="ltr"
                        value={h.open}
                        onChange={(e) => patchHours(h.day, { open: e.target.value })}
                        className="w-24"
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="time"
                        dir="ltr"
                        value={h.close}
                        onChange={(e) => patchHours(h.day, { close: e.target.value })}
                        className="w-24"
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Step 3 — first service */}
        {step === 2 ? (
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{t("service.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("service.hint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="svc-name">{tSettings("clinic.name")}</Label>
              <Input
                id="svc-name"
                value={svcName}
                onChange={(e) => setSvcName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">JOD</Label>
                <Input
                  type="number"
                  dir="ltr"
                  min={0}
                  step="0.01"
                  value={svcPrice}
                  onChange={(e) => setSvcPrice(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">min</Label>
                <Input
                  type="number"
                  dir="ltr"
                  min={1}
                  value={svcDuration}
                  onChange={(e) => setSvcDuration(e.target.value)}
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* Step 4 — first staff */}
        {step === 3 ? (
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{t("staff.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("staff.hint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-name">{tStaff("inviteDialog.name")}</Label>
              <Input id="st-name" value={stName} onChange={(e) => setStName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-email">{tStaff("inviteDialog.email")}</Label>
              <Input
                id="st-email"
                type="email"
                dir="ltr"
                value={stEmail}
                onChange={(e) => setStEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-role">{tStaff("inviteDialog.role")}</Label>
              <Select value={stRole || undefined} onValueChange={(v) => setStRole(v as InviteRole)}>
                <SelectTrigger id="st-role" className="w-full">
                  <SelectValue placeholder={tStaff("inviteDialog.selectRole")} />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {tStaff(`roles.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {stError ? (
              <p role="alert" className="text-sm text-danger-fg">
                {tStaff(`inviteDialog.${stError}`)}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Nav */}
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={step === 0 || pending}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            {t("back")}
          </Button>
          <div className="flex items-center gap-2">
            {step >= 2 ? (
              <Button variant="ghost" size="sm" disabled={pending} onClick={finish}>
                {t("skip")}
              </Button>
            ) : null}
            {step < 3 ? (
              <Button size="sm" disabled={pending} onClick={next}>
                {t("next")}
              </Button>
            ) : (
              <Button size="sm" disabled={pending} onClick={finishInvite}>
                {pending ? t("finishing") : t("finish")}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
