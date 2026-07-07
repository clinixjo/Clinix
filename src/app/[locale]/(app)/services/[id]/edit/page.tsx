import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { canEditCatalog } from "@/lib/catalog";
import { updateService } from "@/lib/actions/services";
import { getService } from "@/lib/services";
import { ServiceForm } from "@/components/service-form";

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);
  if (!canEditCatalog(profile.role)) redirect(`/${locale}/services`);

  const service = await getService(id);
  if (!service) notFound();

  const updateAction = updateService.bind(null, service.id);

  return (
    <div className="mx-auto max-w-2xl">
      <ServiceForm mode="edit" action={updateAction} initial={service} />
    </div>
  );
}
