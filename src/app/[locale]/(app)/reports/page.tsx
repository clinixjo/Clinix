import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getProfile } from "@/lib/auth";
import {
  getDashboardStats,
  isReportPeriod,
  type DashboardStats,
  type ReportPeriod,
} from "@/lib/reports";
import { formatCurrency } from "@/lib/format";
import { isKnownSource } from "@/lib/patient-sources";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { ListRow, ListRows } from "@/components/list-row";
import { RevenueTrendChart } from "@/components/charts/revenue-trend-chart";
import { TopServicesChart } from "@/components/charts/top-services-chart";

const PERIODS: ReportPeriod[] = ["30d", "90d", "12m"];

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);
  // Reports are financial — owners/admins only (the RPC re-checks at DB level).
  if (profile.role !== "owner" && profile.role !== "admin") {
    redirect(`/${locale}/dashboard`);
  }

  const t = await getTranslations("reports");
  const tPatients = await getTranslations("patients");
  const format = await getFormatter();
  const period: ReportPeriod = isReportPeriod(sp.period) ? sp.period : "30d";

  const stats: DashboardStats = await getDashboardStats(period);

  // KPI derivations
  const { current, previous } = stats.revenue;
  const revenueDelta =
    Number(previous) > 0
      ? (Number(current) - Number(previous)) / Number(previous)
      : null;
  const finished = stats.appointments.completed + stats.appointments.no_show;
  const noShowRate = finished > 0 ? stats.appointments.no_show / finished : null;
  const visitors = stats.patients.visitors_new + stats.patients.visitors_returning;
  const returningRate =
    visitors > 0 ? stats.patients.visitors_returning / visitors : null;
  const contactedPlusBooked = stats.lifecycle.contacted + stats.lifecycle.booked;
  const conversion =
    contactedPlusBooked > 0 ? stats.lifecycle.booked / contactedPlusBooked : null;

  const percent = (v: number) =>
    format.number(v, { style: "percent", maximumFractionDigits: 1 });

  const maxSource = Math.max(1, ...stats.sources.map((s) => s.count));

  const sourceLabel = (src: string) =>
    src === "unknown"
      ? t("sources.unknown")
      : isKnownSource(src)
        ? tPatients(`sources.${src}`)
        : src;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5">
          {PERIODS.map((p) => (
            <Button
              key={p}
              variant={p === period ? "secondary" : "ghost"}
              size="sm"
              asChild
            >
              <Link href={`/reports?period=${p}`}>{t(`periods.${p}`)}</Link>
            </Button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label={t("kpis.revenue")}
          value={
            <span dir="ltr" className="text-brand-800">
              {formatCurrency(Number(current), locale)}
            </span>
          }
          hint={
            revenueDelta !== null
              ? t("kpis.vsPrev", { value: percent(revenueDelta) })
              : undefined
          }
        />
        <MetricCard
          label={t("kpis.noShowRate")}
          value={
            noShowRate !== null ? (
              <span dir="ltr">{percent(noShowRate)}</span>
            ) : (
              "—"
            )
          }
          hint={
            finished > 0
              ? t("kpis.noShowHint", {
                  noShow: stats.appointments.no_show,
                  total: finished,
                })
              : t("kpis.noData")
          }
        />
        <MetricCard
          label={t("kpis.newPatients")}
          value={<span dir="ltr">{stats.patients.new_patients}</span>}
        />
        <MetricCard
          label={t("kpis.returningRate")}
          value={
            returningRate !== null ? (
              <span dir="ltr" className="inline-flex items-center gap-1.5">
                {percent(returningRate)}
                {returningRate >= 0.5 ? (
                  <TrendingUp className="size-4 text-success" />
                ) : (
                  <TrendingDown className="size-4 text-warning" />
                )}
              </span>
            ) : (
              "—"
            )
          }
          hint={
            visitors > 0
              ? t("kpis.returningHint", {
                  returning: stats.patients.visitors_returning,
                  fresh: stats.patients.visitors_new,
                })
              : t("kpis.noData")
          }
        />
      </div>

      {/* Revenue trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("charts.revenueTrend")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueTrendChart
            data={stats.trend.map((p) => ({ ...p, revenue: Number(p.revenue) }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top services */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("charts.topServices")}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.top_services.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("kpis.noData")}
              </p>
            ) : (
              <TopServicesChart
                data={stats.top_services.map((s) => ({
                  ...s,
                  revenue: Number(s.revenue),
                  volume: Number(s.volume),
                }))}
              />
            )}
          </CardContent>
        </Card>

        {/* Acquisition channels */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("sources.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.sources.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("sources.empty")}
              </p>
            ) : (
              stats.sources.map((s) => (
                <div key={s.source} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{sourceLabel(s.source)}</span>
                    <span dir="ltr" className="tabular-nums text-muted-foreground">
                      {s.count}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary">
                    <div
                      className="h-2 rounded-full bg-brand-400"
                      style={{ width: `${(s.count / maxSource) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Practitioner performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("practitioners.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.practitioners.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("practitioners.empty")}
              </p>
            ) : (
              <ListRows>
                {stats.practitioners.map((p) => (
                  <ListRow key={p.name}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block text-sm text-muted-foreground">
                        {t("practitioners.items", { count: Number(p.items) })}
                      </span>
                    </span>
                    <span dir="ltr" className="shrink-0 font-medium tabular-nums">
                      {formatCurrency(Number(p.revenue), locale)}
                    </span>
                  </ListRow>
                ))}
              </ListRows>
            )}
          </CardContent>
        </Card>

        {/* Treatment lifecycle health (M5 ROI) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("lifecycle.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-[13px] text-muted-foreground">
                {t("lifecycle.funnel")}
              </p>
              <div className="grid grid-cols-4 gap-2 text-center">
                {(["pending", "contacted", "booked", "dismissed"] as const).map(
                  (k) => (
                    <div key={k} className="rounded-md bg-secondary p-2">
                      <div dir="ltr" className="text-lg font-medium tabular-nums">
                        {stats.lifecycle[k]}
                      </div>
                      <div className="text-[11px] leading-tight text-muted-foreground">
                        {t(`lifecycle.${k}`)}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t("lifecycle.conversion")}</dt>
                <dd dir="ltr" className="font-medium tabular-nums">
                  {conversion !== null ? percent(conversion) : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t("lifecycle.activePackages")}</dt>
                <dd dir="ltr" className="font-medium tabular-nums">
                  {stats.lifecycle.active_packages}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">
                  {t("lifecycle.outstandingSessions")}
                </dt>
                <dd dir="ltr" className="font-medium tabular-nums">
                  {stats.lifecycle.outstanding_sessions}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t("lifecycle.messagesSent")}</dt>
                <dd dir="ltr" className="font-medium tabular-nums">
                  {stats.lifecycle.messages_sent}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
