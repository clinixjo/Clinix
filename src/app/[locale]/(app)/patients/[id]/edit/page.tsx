import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { updatePatient } from "@/lib/actions/patients";
import { getPatient } from "@/lib/patients";
import { PatientForm } from "@/components/patient-form";

export default async function EditPatientPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const patient = await getPatient(id);
  if (!patient) notFound();

  const updateAction = updatePatient.bind(null, patient.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PatientForm mode="edit" action={updateAction} initial={patient} />
    </div>
  );
}
