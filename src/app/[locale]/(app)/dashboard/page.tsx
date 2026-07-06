import { getTranslations, setRequestLocale } from "next-intl/server";
import { getProfile } from "@/lib/auth";
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
  const profile = (await getProfile())!;

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

      {/* KPI placeholders — wired to real data in M1–M6 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label={t("todayAppointments")} value="—" hint={t("comingSoon")} />
        <MetricCard label={t("dueFollowups")} value="—" hint={t("comingSoon")} />
        <MetricCard label={t("newPatients")} value="—" hint={t("comingSoon")} />
        <MetricCard label={t("monthRevenue")} value="—" hint={t("comingSoon")} />
      </div>
    </div>
  );
}
