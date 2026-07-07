import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { canRecordSales, getActivePackagesForPatient } from "@/lib/sales";
import { recordSale } from "@/lib/actions/sales";
import { listPatients } from "@/lib/patients";
import { listActiveServices } from "@/lib/services";
import { listPackages } from "@/lib/packages";
import { listPractitioners } from "@/lib/appointments";
import { CheckoutForm } from "@/components/checkout-form";

export default async function NewSalePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ patient?: string; visit?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { patient, visit } = await searchParams;

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);
  if (!canRecordSales(profile)) redirect(`/${locale}/sales`);

  const [patients, services, packages, practitioners, initialPackages] =
    await Promise.all([
      listPatients(),
      listActiveServices(),
      listPackages(),
      listPractitioners(),
      patient ? getActivePackagesForPatient(patient) : Promise.resolve([]),
    ]);

  return (
    <div className="mx-auto max-w-2xl">
      <CheckoutForm
        action={recordSale}
        patients={patients.map((p) => ({ id: p.id, name: p.name }))}
        services={services.map((s) => ({ id: s.id, name: s.name, price: s.price }))}
        packages={packages
          .filter((p) => p.is_active)
          .map((p) => ({ id: p.id, name: p.name, price: p.price }))}
        practitioners={practitioners}
        initialPatientId={patient}
        initialVisitId={visit}
        initialPackages={initialPackages}
      />
    </div>
  );
}
