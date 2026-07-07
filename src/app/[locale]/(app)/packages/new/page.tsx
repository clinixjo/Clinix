import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { canEditCatalog } from "@/lib/catalog";
import { createPackage } from "@/lib/actions/packages";
import { listActiveServices } from "@/lib/services";
import { PackageForm } from "@/components/package-form";

export default async function NewPackagePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);
  if (!canEditCatalog(profile.role)) redirect(`/${locale}/packages`);

  const services = await listActiveServices();

  return (
    <div className="mx-auto max-w-2xl">
      <PackageForm mode="create" action={createPackage} services={services} />
    </div>
  );
}
