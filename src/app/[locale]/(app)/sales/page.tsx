import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Plus, Receipt } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getProfile } from "@/lib/auth";
import { canRecordSales, listSales } from "@/lib/sales";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ListRow, ListRows } from "@/components/list-row";
import { StatusBadge } from "@/components/status-badge";

const saleStatusVariant = {
  paid: "success",
  partial: "warning",
  unpaid: "warning",
  refunded: "neutral",
} as const;

export default async function SalesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);

  const t = await getTranslations("sales");
  const format = await getFormatter();
  const sales = await listSales();
  const canRecord = canRecordSales(profile);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("count", { count: sales.length })}
          </p>
        </div>
        {canRecord ? (
          <Button asChild>
            <Link href="/sales/new">
              <Plus className="size-4" />
              {t("newSale")}
            </Link>
          </Button>
        ) : null}
      </div>

      {!canRecord ? (
        <p className="text-sm text-muted-foreground">{t("viewOnlyHint")}</p>
      ) : null}

      <Card>
        <CardContent>
          {sales.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Receipt className="size-8 text-muted-foreground" />
              <p className="font-medium">{t("emptyTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
            </div>
          ) : (
            <ListRows>
              {sales.map((sale) => (
                <ListRow key={sale.id} className="px-1">
                  <Link href={`/sales/${sale.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {sale.patient?.name ?? "—"}
                        </span>
                        <StatusBadge variant={saleStatusVariant[sale.status]}>
                          {t(`statuses.${sale.status}`)}
                        </StatusBadge>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {format.dateTime(new Date(`${sale.sale_date}T00:00:00Z`), {
                          dateStyle: "medium",
                          timeZone: "UTC",
                        })}
                        {sale.payment_method ? ` · ${t(`payment.${sale.payment_method}`)}` : ""}
                      </span>
                    </span>
                    <span dir="ltr" className="shrink-0 font-medium tabular-nums">
                      {formatCurrency(Number(sale.total), locale)}
                    </span>
                  </Link>
                </ListRow>
              ))}
            </ListRows>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
