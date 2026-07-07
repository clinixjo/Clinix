import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { canEditCatalog } from "@/lib/catalog";
import { createService } from "@/lib/actions/services";
import { ServiceForm } from "@/components/service-form";

export default async function NewServicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);
  if (!canEditCatalog(profile.role)) redirect(`/${locale}/services`);

  return (
    <div className="mx-auto max-w-2xl">
      <ServiceForm mode="create" action={createService} />
    </div>
  );
}
