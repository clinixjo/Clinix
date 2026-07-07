import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { canEditCatalog } from "@/lib/catalog";
import { updatePackage } from "@/lib/actions/packages";
import { getPackage } from "@/lib/packages";
import { listActiveServices } from "@/lib/services";
import { PackageForm } from "@/components/package-form";

export default async function EditPackagePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);
  if (!canEditCatalog(profile.role)) redirect(`/${locale}/packages`);

  const [pkg, services] = await Promise.all([
    getPackage(id),
    listActiveServices(),
  ]);
  if (!pkg) notFound();

  const updateAction = updatePackage.bind(null, pkg.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PackageForm
        mode="edit"
        action={updateAction}
        initial={pkg}
        services={services}
      />
    </div>
  );
}
