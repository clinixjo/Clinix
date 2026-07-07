"use client";

import { useActionState, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { PackageFormState } from "@/lib/actions/packages";
import type { PackageDetail } from "@/lib/packages";
import { formatCurrency } from "@/lib/format";
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

type ServiceOption = { id: string; name: string; price: number };
type ItemRow = { key: string; service_id: string; quantity: number };

let rowSeq = 0;
const newRow = (service_id = "", quantity = 1): ItemRow => ({
  key: `row-${rowSeq++}`,
  service_id,
  quantity,
});

export function PackageForm({
  action,
  initial,
  mode,
  services,
}: {
  action: (
    prevState: PackageFormState,
    formData: FormData
  ) => Promise<PackageFormState>;
  initial?: PackageDetail;
  mode: "create" | "edit";
  services: ServiceOption[];
}) {
  const t = useTranslations("packages");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(action, null);

  const priceById = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of services) map.set(s.id, s.price);
    return map;
  }, [services]);

  const [price, setPrice] = useState<string>(
    initial ? String(initial.price) : ""
  );
  const [items, setItems] = useState<ItemRow[]>(
    initial && initial.items.length > 0
      ? initial.items.map((i) => newRow(i.service_id, i.quantity))
      : [newRow()]
  );

  const totalValue = items.reduce(
    (sum, row) => sum + (priceById.get(row.service_id) ?? 0) * row.quantity,
    0
  );
  const packagePrice = Number(price) || 0;
  const savings = totalValue - packagePrice;

  // Only fully-specified rows are persisted.
  const payload = items
    .filter((row) => row.service_id !== "" && row.quantity > 0)
    .map((row) => ({ service_id: row.service_id, quantity: row.quantity }));

  function updateRow(key: string, patch: Partial<ItemRow>) {
    setItems((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="items" value={JSON.stringify(payload)} />

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
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 sm:pt-8">
            <Checkbox
              id="is_active"
              name="is_active"
              defaultChecked={initial?.is_active ?? true}
            />
            <Label htmlFor="is_active">{t("fields.isActive")}</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("items.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((row) => (
            <div key={row.key} className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {t("items.service")}
                </Label>
                <Select
                  value={row.service_id || undefined}
                  onValueChange={(value) =>
                    updateRow(row.key, { service_id: value })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("items.selectService")} />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.name} · {formatCurrency(service.price, locale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-20 space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {t("items.quantity")}
                </Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  dir="ltr"
                  value={row.quantity}
                  onChange={(e) =>
                    updateRow(row.key, {
                      quantity: Math.max(1, Math.trunc(Number(e.target.value)) || 1),
                    })
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("items.remove")}
                onClick={() =>
                  setItems((rows) =>
                    rows.length > 1
                      ? rows.filter((r) => r.key !== row.key)
                      : rows
                  )
                }
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setItems((rows) => [...rows, newRow()])}
          >
            <Plus className="size-4" />
            {t("items.addItem")}
          </Button>

          {/* Live value / price / savings summary */}
          <dl className="mt-2 space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">
                {t("summary.totalValue")}
              </dt>
              <dd dir="ltr" className="tabular-nums">
                {formatCurrency(totalValue, locale)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">
                {t("summary.packagePrice")}
              </dt>
              <dd dir="ltr" className="tabular-nums">
                {formatCurrency(packagePrice, locale)}
              </dd>
            </div>
            <div className="flex items-center justify-between font-medium">
              <dt className="text-brand-800">{t("summary.savings")}</dt>
              <dd dir="ltr" className="tabular-nums text-brand-800">
                {formatCurrency(Math.max(0, savings), locale)}
              </dd>
            </div>
          </dl>
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
          <Link href="/packages">{tCommon("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
