import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { OnboardingWizard } from "@/components/onboarding-wizard";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);
  // Only managers onboard; everyone else (and already-onboarded clinics) → app.
  const isManager = profile.role === "owner" || profile.role === "admin";
  if (!isManager || profile.clinic.settings.onboarded === true) {
    redirect(`/${locale}/dashboard`);
  }

  const t = await getTranslations("onboarding");

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex justify-end p-4">
        <LocaleSwitcher />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-brand-800">{t("welcome")}</h1>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        <OnboardingWizard
          clinicName={profile.clinic.name}
          logoUrl={profile.clinic.logo_url}
        />
      </div>
    </div>
  );
}
