import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { BellRing, PackageCheck, Sparkles } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { getDueFollowups, getPackageReminders } from "@/lib/followups";
import { waLink } from "@/lib/whatsapp";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { FollowupActions } from "@/components/followup-actions";

export default async function FollowupsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);

  const t = await getTranslations("followups");
  const clinicName = profile.clinic.name;

  const [due, packages] = await Promise.all([
    getDueFollowups(),
    getPackageReminders(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Due follow-ups */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BellRing className="size-4 text-brand-600" />
          <h2 className="font-medium">{t("dueSection")}</h2>
          <StatusBadge variant="info">{t("dueCount", { count: due.length })}</StatusBadge>
        </div>

        {due.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t("emptyDue")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {due.map((f) => {
              const name = f.patient?.name ?? "—";
              const service = f.service?.name ?? "";
              const body = t("templates.service", { name, service, clinic: clinicName });
              const link = waLink(f.patient?.whatsapp ?? f.patient?.phone ?? null, body);
              return (
                <Card key={f.id}>
                  <CardContent className="flex flex-wrap items-center gap-3 py-4">
                    <UserAvatar name={name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{name}</span>
                        {f.overdueDays === 0 ? (
                          <StatusBadge variant="info">{t("due.today")}</StatusBadge>
                        ) : (
                          <StatusBadge variant="warning">
                            {t("due.overdue", { count: f.overdueDays })}
                          </StatusBadge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t("reasons.service", { service })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <WhatsAppButton
                        waLink={link}
                        body={body}
                        patientId={f.patient?.id ?? ""}
                        followupId={f.id}
                      />
                      <FollowupActions followupId={f.id} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Package reminders */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <PackageCheck className="size-4 text-brand-600" />
          <h2 className="font-medium">{t("packageSection")}</h2>
        </div>

        {packages.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t("emptyPackages")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {packages.map((p) => {
              const name = p.patient?.name ?? "—";
              const body = t("templates.package", {
                name,
                count: p.remaining,
                clinic: clinicName,
              });
              const link = waLink(p.patient?.whatsapp ?? p.patient?.phone ?? null, body);
              return (
                <Card key={p.id}>
                  <CardContent className="flex flex-wrap items-center gap-3 py-4">
                    <UserAvatar name={name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{name}</span>
                        <StatusBadge variant="success">
                          <Sparkles className="size-3" />
                          {t("due.sessionsRemaining", { count: p.remaining })}
                        </StatusBadge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t("reasons.package", { package: p.packageName })}
                      </p>
                    </div>
                    <WhatsAppButton
                      waLink={link}
                      body={body}
                      patientId={p.patient?.id ?? ""}
                      initialContacted={p.contactedToday}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
