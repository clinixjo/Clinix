import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Clock, Pencil, Plus, RefreshCw, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getProfile } from "@/lib/auth";
import { listServices } from "@/lib/services";
import { deleteService } from "@/lib/actions/services";
import { canEditCatalog } from "@/lib/catalog";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ListRow, ListRows } from "@/components/list-row";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);

  const t = await getTranslations("services");
  const tCommon = await getTranslations("common");
  const services = await listServices();
  const canEdit = canEditCatalog(profile.role);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("count", { count: services.length })}
          </p>
        </div>
        {canEdit ? (
          <Button asChild>
            <Link href="/services/new">
              <Plus className="size-4" />
              {t("addService")}
            </Link>
          </Button>
        ) : null}
      </div>

      {!canEdit ? (
        <p className="text-sm text-muted-foreground">{t("viewOnlyHint")}</p>
      ) : null}

      <Card>
        <CardContent>
          {services.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Sparkles className="size-8 text-muted-foreground" />
              <p className="font-medium">{t("emptyTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
            </div>
          ) : (
            <ListRows>
              {services.map((service) => (
                <ListRow key={service.id} className="flex-wrap gap-y-1">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {service.name}
                      </span>
                      {!service.is_active ? (
                        <StatusBadge variant="neutral">
                          {t("inactive")}
                        </StatusBadge>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                      {service.category ? <span>{service.category}</span> : null}
                      {service.duration_min ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3.5" />
                          {t("fields.minutesValue", {
                            count: service.duration_min,
                          })}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1">
                        <RefreshCw className="size-3.5" />
                        {service.followup_interval_days
                          ? t("fields.daysValue", {
                              count: service.followup_interval_days,
                            })
                          : t("noFollowup")}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span dir="ltr" className="font-medium tabular-nums">
                      {formatCurrency(service.price, locale)}
                    </span>
                    {canEdit ? (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" asChild>
                          <Link
                            href={`/services/${service.id}/edit`}
                            aria-label={t("form.editTitle")}
                          >
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                        <ConfirmDeleteButton
                          action={deleteService.bind(null, service.id)}
                          triggerLabel={t("delete.action")}
                          title={t("delete.confirmTitle")}
                          description={t("delete.confirmText", {
                            name: service.name,
                          })}
                          confirmLabel={t("delete.confirm")}
                          cancelLabel={tCommon("cancel")}
                          size="icon"
                          iconOnly
                        />
                      </div>
                    ) : null}
                  </div>
                </ListRow>
              ))}
            </ListRows>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
