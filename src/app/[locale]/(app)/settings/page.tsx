import { getTranslations, setRequestLocale } from "next-intl/server";
import { getProfile } from "@/lib/auth";
import { parseBusinessHours } from "@/lib/business-hours";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { ClinicProfileForm } from "@/components/settings/clinic-profile-form";
import { LogoUploader } from "@/components/settings/logo-uploader";
import { BusinessHoursEditor } from "@/components/settings/business-hours-editor";
import { PractitionerPermissionToggle } from "@/components/settings/practitioner-permission-toggle";

type ClinicSettings = {
  practitioner_can_edit?: boolean;
  tax_id?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  business_hours?: unknown;
  subscription_status?: string;
};

export default async function SettingsClinicPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("settings");
  const profile = (await getProfile())!;
  const settings = profile.clinic.settings as ClinicSettings;
  const logoUrl = (profile.clinic as { logo_url?: string | null }).logo_url ?? null;
  const subStatus =
    (profile.clinic as { subscription_status?: string }).subscription_status ?? "trial";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Clinic profile */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">{t("clinic.profile")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <LogoUploader clinicName={profile.clinic.name} logoUrl={logoUrl} />
          <ClinicProfileForm
            initial={{
              name: profile.clinic.name,
              tax_id: settings.tax_id ?? null,
              contact_phone: settings.contact_phone ?? null,
              contact_email: settings.contact_email ?? null,
            }}
          />
        </CardContent>
      </Card>

      {/* Business hours */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("hours.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("hours.hint")}</p>
        </CardHeader>
        <CardContent>
          <BusinessHoursEditor initial={parseBusinessHours(settings.business_hours)} />
        </CardContent>
      </Card>

      <div className="space-y-4">
        {/* Practitioner permissions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("permissions.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <PractitionerPermissionToggle
              initial={settings.practitioner_can_edit === true}
            />
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("subscription.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("subscription.status")}</span>
              <StatusBadge variant={subStatus === "active" ? "success" : "warning"}>
                {t(`subscription.${subStatus}`)}
              </StatusBadge>
            </div>
            <p className="text-xs text-muted-foreground">{t("subscription.hint")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
