import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Building2, ScrollText, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getProfile } from "@/lib/auth";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);
  // Settings are owner/admin only.
  if (profile.role !== "owner" && profile.role !== "admin") {
    redirect(`/${locale}/dashboard`);
  }

  const t = await getTranslations("settings");

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-semibold">{t("title")}</h1>
      <nav className="flex gap-1 border-b border-border">
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Building2 className="size-4" />
          {t("nav.clinic")}
        </Link>
        <Link
          href="/settings/staff"
          className="inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Users className="size-4" />
          {t("nav.staff")}
        </Link>
        <Link
          href="/settings/audit"
          className="inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ScrollText className="size-4" />
          {t("nav.audit")}
        </Link>
      </nav>
      {children}
    </div>
  );
}
