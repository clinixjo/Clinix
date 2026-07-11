import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  if (!profile) {
    // Signed out, deactivated, or no staff profile row.
    redirect(`/${locale}/login`);
  }

  // First-run: route managers of an un-onboarded clinic to the wizard.
  // /onboarding lives outside this route group, so no redirect loop.
  const isManager = profile.role === "owner" || profile.role === "admin";
  if (isManager && profile.clinic.settings.onboarded !== true) {
    redirect(`/${locale}/onboarding`);
  }

  const canSeeSales =
    profile.role !== "practitioner" ||
    profile.clinic.settings.practitioner_can_edit === true;

  return (
    <AppShell
      profile={{
        name: profile.name,
        role: profile.role,
        clinicName: profile.clinic.name,
        canSeeSales,
      }}
    >
      {children}
    </AppShell>
  );
}
