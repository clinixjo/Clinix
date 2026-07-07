import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Package as PackageIcon, Pencil, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getProfile } from "@/lib/auth";
import { listPackages } from "@/lib/packages";
import { deletePackage } from "@/lib/actions/packages";
import { canEditCatalog } from "@/lib/catalog";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ListRow, ListRows } from "@/components/list-row";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";

export default async function PackagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);

  const t = await getTranslations("packages");
  const tCommon = await getTranslations("common");
  const packages = await listPackages();
  const canEdit = canEditCatalog(profile.role);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("count", { count: packages.length })}
          </p>
        </div>
        {canEdit ? (
          <Button asChild>
            <Link href="/packages/new">
              <Plus className="size-4" />
              {t("addPackage")}
            </Link>
          </Button>
        ) : null}
      </div>

      {!canEdit ? (
        <p className="text-sm text-muted-foreground">{t("viewOnlyHint")}</p>
      ) : null}

      <Card>
        <CardContent>
          {packages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <PackageIcon className="size-8 text-muted-foreground" />
              <p className="font-medium">{t("emptyTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
            </div>
          ) : (
            <ListRows>
              {packages.map((pkg) => {
                const savings = Math.max(0, pkg.totalValue - pkg.price);
                return (
                  <ListRow key={pkg.id} className="flex-wrap gap-y-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{pkg.name}</span>
                        {!pkg.is_active ? (
                          <StatusBadge variant="neutral">
                            {t("inactive")}
                          </StatusBadge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                        <span>{t("summary.itemsCount", { count: pkg.itemCount })}</span>
                        {savings > 0 ? (
                          <span className="text-success-fg">
                            {t("summary.savings")}: {formatCurrency(savings, locale)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-end">
                        <span dir="ltr" className="block font-medium tabular-nums">
                          {formatCurrency(pkg.price, locale)}
                        </span>
                        {savings > 0 ? (
                          <span
                            dir="ltr"
                            className="block text-xs text-muted-foreground line-through tabular-nums"
                          >
                            {formatCurrency(pkg.totalValue, locale)}
                          </span>
                        ) : null}
                      </span>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" asChild>
                            <Link
                              href={`/packages/${pkg.id}/edit`}
                              aria-label={t("form.editTitle")}
                            >
                              <Pencil className="size-4" />
                            </Link>
                          </Button>
                          <ConfirmDeleteButton
                            action={deletePackage.bind(null, pkg.id)}
                            triggerLabel={t("delete.action")}
                            title={t("delete.confirmTitle")}
                            description={t("delete.confirmText", { name: pkg.name })}
                            confirmLabel={t("delete.confirm")}
                            cancelLabel={tCommon("cancel")}
                            size="icon"
                            iconOnly
                          />
                        </div>
                      ) : null}
                    </div>
                  </ListRow>
                );
              })}
            </ListRows>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
