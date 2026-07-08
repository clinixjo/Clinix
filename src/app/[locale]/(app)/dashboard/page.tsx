import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getProfile } from "@/lib/auth";
import { getDashboardCounts } from "@/lib/dashboard";
import { canRecordSales } from "@/lib/sales";
import { formatCurrency } from "@/lib/format";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("dashboard");
  const tRoles = await getTranslations("roles");
  const profile = await getProfile();
  if (!profile) {
    redirect(`/${locale}/login`);
  }

  const counts = await getDashboardCounts(canRecordSales(profile));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">
          {t("welcome", { name: profile.name })} —{" "}
          <span className="text-foreground">{profile.clinic.name}</span>{" "}
          <StatusBadge variant="info">{tRoles(profile.role)}</StatusBadge>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link href="/appointments" className="block">
          <MetricCard
            label={t("todayAppointments")}
            value={<span dir="ltr">{counts.todayAppointments}</span>}
            className="h-full transition-colors hover:bg-accent/50"
          />
        </Link>
        <Link href="/followups" className="block">
          <MetricCard
            label={t("dueFollowups")}
            value={<span dir="ltr">{counts.dueFollowups}</span>}
            className="h-full transition-colors hover:bg-accent/50"
          />
        </Link>
        <Link href="/patients" className="block">
          <MetricCard
            label={t("newPatients")}
            value={<span dir="ltr">{counts.newPatientsThisMonth}</span>}
            className="h-full transition-colors hover:bg-accent/50"
          />
        </Link>
        {counts.monthRevenue !== null ? (
          <Link href="/sales" className="block">
            <MetricCard
              label={t("monthRevenue")}
              value={
                <span dir="ltr" className="text-brand-800">
                  {formatCurrency(counts.monthRevenue, locale)}
                </span>
              }
              className="h-full transition-colors hover:bg-accent/50"
            />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
