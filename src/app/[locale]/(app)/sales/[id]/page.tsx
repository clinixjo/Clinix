import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { dirFor } from "@/i18n/routing";
import { getProfile } from "@/lib/auth";
import { canManageSales, getSale } from "@/lib/sales";
import { deleteSale } from "@/lib/actions/sales";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";

const saleStatusVariant = {
  paid: "success",
  partial: "warning",
  unpaid: "warning",
  refunded: "neutral",
} as const;

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);

  const sale = await getSale(id);
  if (!sale) notFound();

  const t = await getTranslations("sales");
  const tCommon = await getTranslations("common");
  const format = await getFormatter();
  const BackIcon = dirFor(locale) === "rtl" ? ArrowRight : ArrowLeft;
  const invoiceNo = `#${sale.id.slice(0, 8).toUpperCase()}`;
  const taxId = (profile.clinic.settings as { tax_id?: string | null }).tax_id ?? null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href="/sales"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <BackIcon className="size-4" />
          {t("invoice.backToSales")}
        </Link>
        {canManageSales(profile) ? (
          <ConfirmDeleteButton
            action={deleteSale.bind(null, sale.id)}
            triggerLabel={t("delete.action")}
            title={t("delete.confirmTitle")}
            description={t("delete.confirmText", { patient: sale.patient?.name ?? "—" })}
            confirmLabel={t("delete.confirm")}
            cancelLabel={tCommon("cancel")}
          />
        ) : null}
      </div>

      <Card className="overflow-hidden">
        {/* Letterhead */}
        <div className="bg-brand-50/60 px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-brand-800">
                {profile.clinic.name}
              </p>
              <p className="text-sm text-muted-foreground">{t("invoice.title")}</p>
              {taxId ? (
                <p dir="ltr" className="text-xs text-muted-foreground">
                  {t("invoice.taxId")}: {taxId}
                </p>
              ) : null}
            </div>
            <StatusBadge variant={saleStatusVariant[sale.status]}>
              {t(`statuses.${sale.status}`)}
            </StatusBadge>
          </div>
        </div>

        <CardContent className="space-y-5 py-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[13px] text-muted-foreground">{t("invoice.billedTo")}</p>
              <p className="font-medium">{sale.patient?.name ?? "—"}</p>
            </div>
            <div className="text-end">
              <p className="text-[13px] text-muted-foreground">{t("invoice.number")}</p>
              <p dir="ltr" className="font-medium tabular-nums">{invoiceNo}</p>
            </div>
            <div>
              <p className="text-[13px] text-muted-foreground">{t("invoice.issuedOn")}</p>
              <p>{format.dateTime(new Date(`${sale.sale_date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}</p>
            </div>
            {sale.payment_method ? (
              <div className="text-end">
                <p className="text-[13px] text-muted-foreground">{t("invoice.paidWith")}</p>
                <p>{t(`payment.${sale.payment_method}`)}</p>
              </div>
            ) : null}
          </div>

          <Separator />

          {/* Line items */}
          <div className="space-y-3">
            {sale.items.map((item) => {
              const name = item.service?.name ?? item.package?.name ?? "—";
              const covered = Number(item.price) === 0;
              return (
                <div key={item.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.practitioner?.name ? `${t("invoice.servedBy")} ${item.practitioner.name} · ` : ""}
                      <span dir="ltr">×{item.quantity}</span>
                    </p>
                  </div>
                  {covered ? (
                    <span className="shrink-0 text-sm text-success-fg">{t("invoice.covered")}</span>
                  ) : (
                    <span dir="ltr" className="shrink-0 tabular-nums">
                      {formatCurrency(Number(item.price) * item.quantity, locale)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <Separator />

          <div className="flex items-center justify-between text-lg font-semibold">
            <span>{t("invoice.total")}</span>
            <span dir="ltr" className="tabular-nums text-brand-800">
              {formatCurrency(Number(sale.total), locale)}
            </span>
          </div>

          <p className="pt-2 text-center text-sm text-muted-foreground">
            {t("invoice.thankYou")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
