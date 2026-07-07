"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Banknote, CreditCard, Landmark, Plus, Sparkles, Ticket, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { SaleFormState } from "@/lib/actions/sales";
import type { ActivePackage } from "@/lib/sales";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Opt = { id: string; name: string; price?: number };
type PaymentMethod = "cash" | "card" | "transfer";

type Row =
  | { key: string; kind: "service"; service_id: string; practitioner_id: string; quantity: number; price: string }
  | { key: string; kind: "package"; package_id: string; price: string }
  | { key: string; kind: "redeem"; patient_package_id: string; service_id: string; practitioner_id: string; quantity: number };

let seq = 0;
const uid = () => `r${seq++}`;

const PAYMENTS: { method: PaymentMethod; icon: React.ComponentType<{ className?: string }> }[] = [
  { method: "cash", icon: Banknote },
  { method: "card", icon: CreditCard },
  { method: "transfer", icon: Landmark },
];

export function CheckoutForm({
  action,
  patients,
  services,
  packages,
  practitioners,
  initialPatientId,
  initialVisitId,
  initialPackages,
}: {
  action: (prev: SaleFormState, fd: FormData) => Promise<SaleFormState>;
  patients: Opt[];
  services: Opt[];
  packages: Opt[];
  practitioners: Opt[];
  initialPatientId?: string;
  initialVisitId?: string;
  initialPackages: ActivePackage[];
}) {
  const t = useTranslations("sales");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(action, null);

  const servicePrice = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of services) m.set(s.id, s.price ?? 0);
    return m;
  }, [services]);
  const packagePrice = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of packages) m.set(p.id, p.price ?? 0);
    return m;
  }, [packages]);

  const [patientId, setPatientId] = useState(initialPatientId ?? "");
  const [activePackages, setActivePackages] = useState<ActivePackage[]>(initialPackages);
  const [rows, setRows] = useState<Row[]>([]);
  const [payment, setPayment] = useState<PaymentMethod | "">("");

  // Refresh redeemable packages when the patient changes to a new one.
  // (The initial patient's packages are provided by the server; the
  // patient select can't be cleared back to empty.)
  useEffect(() => {
    if (!patientId || patientId === initialPatientId) return;
    let cancelled = false;
    fetch(`/api/patient-packages?patient=${patientId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setActivePackages(d.packages ?? []);
      })
      .catch(() => {
        if (!cancelled) setActivePackages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, initialPatientId]);

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? ({ ...r, ...patch } as Row) : r)));
  }
  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  const total = rows.reduce((sum, r) => {
    if (r.kind === "service") return sum + (Number(r.price) || 0) * r.quantity;
    if (r.kind === "package") return sum + (Number(r.price) || 0);
    return sum;
  }, 0);

  // Normalized payload for record_sale().
  const payload = rows
    .map((r) => {
      if (r.kind === "service" && r.service_id)
        return { kind: "service", service_id: r.service_id, practitioner_id: r.practitioner_id || undefined, quantity: r.quantity, price: Number(r.price) || 0 };
      if (r.kind === "package" && r.package_id)
        return { kind: "package", package_id: r.package_id, price: Number(r.price) || 0 };
      if (r.kind === "redeem" && r.patient_package_id && r.service_id)
        return { kind: "redeem", patient_package_id: r.patient_package_id, service_id: r.service_id, practitioner_id: r.practitioner_id || undefined, quantity: r.quantity };
      return null;
    })
    .filter(Boolean);

  const canSubmit = Boolean(patientId) && payload.length > 0 && (total === 0 || payment !== "");

  function PractitionerSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t("checkout.practitioner")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("checkout.practitioner")}</SelectItem>
          {practitioners.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="patient_id" value={patientId} />
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      <input type="hidden" name="payment_method" value={total === 0 ? "" : payment} />
      {initialVisitId ? <input type="hidden" name="visit_id" value={initialVisitId} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("checkout.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="patient">{t("checkout.patient")}</Label>
          <Select value={patientId || undefined} onValueChange={setPatientId}>
            <SelectTrigger id="patient" className="w-full">
              <SelectValue placeholder={t("checkout.selectPatient")} />
            </SelectTrigger>
            <SelectContent>
              {patients.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("checkout.items")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("checkout.emptyItems")}</p>
          ) : (
            rows.map((row) => (
              <div key={row.key} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700">
                    {row.kind === "service" ? <Sparkles className="size-3.5" /> : row.kind === "package" ? <Plus className="size-3.5" /> : <Ticket className="size-3.5" />}
                    {row.kind === "service" ? t("checkout.service") : row.kind === "package" ? t("checkout.package") : t("checkout.redeemSession")}
                  </span>
                  <Button type="button" variant="ghost" size="icon" aria-label={t("checkout.remove")} onClick={() => remove(row.key)}>
                    <X className="size-4" />
                  </Button>
                </div>

                {row.kind === "service" ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select
                      value={row.service_id || undefined}
                      onValueChange={(v) => update(row.key, { service_id: v, price: String(servicePrice.get(v) ?? row.price) })}
                    >
                      <SelectTrigger className="w-full"><SelectValue placeholder={t("checkout.selectService")} /></SelectTrigger>
                      <SelectContent>
                        {services.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <PractitionerSelect value={row.practitioner_id} onChange={(v) => update(row.key, { practitioner_id: v })} />
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("checkout.unitPrice")}</Label>
                      <Input type="number" inputMode="decimal" min={0} step="0.01" dir="ltr" value={row.price} onChange={(e) => update(row.key, { price: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("checkout.quantity")}</Label>
                      <Input type="number" inputMode="numeric" min={1} dir="ltr" value={row.quantity} onChange={(e) => update(row.key, { quantity: Math.max(1, Math.trunc(Number(e.target.value)) || 1) })} />
                    </div>
                  </div>
                ) : null}

                {row.kind === "package" ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select
                      value={row.package_id || undefined}
                      onValueChange={(v) => update(row.key, { package_id: v, price: String(packagePrice.get(v) ?? row.price) })}
                    >
                      <SelectTrigger className="w-full"><SelectValue placeholder={t("checkout.selectPackage")} /></SelectTrigger>
                      <SelectContent>
                        {packages.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("checkout.unitPrice")}</Label>
                      <Input type="number" inputMode="decimal" min={0} step="0.01" dir="ltr" value={row.price} onChange={(e) => update(row.key, { price: e.target.value })} />
                    </div>
                  </div>
                ) : null}

                {row.kind === "redeem" ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select value={row.patient_package_id || undefined} onValueChange={(v) => update(row.key, { patient_package_id: v })}>
                      <SelectTrigger className="w-full"><SelectValue placeholder={t("checkout.package")} /></SelectTrigger>
                      <SelectContent>
                        {activePackages.map((ap) => (
                          <SelectItem key={ap.id} value={ap.id}>
                            {ap.label} · {t("checkout.sessionsRemaining", { count: ap.remaining })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={row.service_id || undefined} onValueChange={(v) => update(row.key, { service_id: v })}>
                      <SelectTrigger className="w-full"><SelectValue placeholder={t("checkout.selectService")} /></SelectTrigger>
                      <SelectContent>
                        {services.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <PractitionerSelect value={row.practitioner_id} onChange={(v) => update(row.key, { practitioner_id: v })} />
                    <p className="self-center text-sm font-medium text-success-fg">{t("checkout.coveredByPackage")}</p>
                  </div>
                ) : null}
              </div>
            ))
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, { key: uid(), kind: "service", service_id: "", practitioner_id: "", quantity: 1, price: "" }])}>
              <Sparkles className="size-4" /> {t("checkout.addService")}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, { key: uid(), kind: "package", package_id: "", price: "" }])}>
              <Plus className="size-4" /> {t("checkout.sellPackage")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={activePackages.length === 0}
              onClick={() => setRows((rs) => [...rs, { key: uid(), kind: "redeem", patient_package_id: "", service_id: "", practitioner_id: "", quantity: 1 }])}
            >
              <Ticket className="size-4" /> {t("checkout.redeemSession")}
            </Button>
          </div>
          {patientId && activePackages.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("checkout.noActivePackages")}</p>
          ) : null}
        </CardContent>
      </Card>

      {/* Payment */}
      {total > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("payment.label")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            {PAYMENTS.map(({ method, icon: Icon }) => (
              <button
                key={method}
                type="button"
                onClick={() => setPayment(method)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-3 text-start transition-colors",
                  payment === method ? "border-brand-400 bg-brand-50/50 ring-1 ring-brand-400" : "border-border hover:border-border-strong"
                )}
              >
                <Icon className={cn("size-5", payment === method ? "text-brand-600" : "text-muted-foreground")} />
                <span className="font-medium">{t(`payment.${method}`)}</span>
                <span className="text-xs text-muted-foreground">{t(`payment.${method}Hint`)}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : payload.length > 0 ? (
        <Card className="border-success/30 bg-success-bg/40">
          <CardContent className="py-4">
            <p className="font-medium text-success-fg">{t("payment.coveredTitle")}</p>
            <p className="text-sm text-success-fg/80">{t("payment.coveredHint")}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Total + submit */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center justify-between text-lg font-semibold">
            <span>{t("checkout.grandTotal")}</span>
            <span dir="ltr" className="tabular-nums text-brand-800">{formatCurrency(total, locale)}</span>
          </div>
          {state?.error ? (
            <p role="alert" className="text-sm text-danger-fg">{t(`errors.${state.error}`)}</p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending || !canSubmit}>
              {pending ? t("checkout.recording") : t("checkout.record")}
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/sales">{tCommon("cancel")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
