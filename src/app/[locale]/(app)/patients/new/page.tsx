import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createPatient } from "@/lib/actions/patients";
import { canAccessMedicalNotes } from "@/lib/patients";
import { PatientForm } from "@/components/patient-form";

export default async function NewPatientPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);

  return (
    <div className="mx-auto max-w-2xl">
      <PatientForm
        mode="create"
        action={createPatient}
        canWriteMedicalNote={canAccessMedicalNotes(profile.role)}
      />
    </div>
  );
}
