import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import {
  canBookAppointments,
  listPractitioners,
} from "@/lib/appointments";
import { createAppointment } from "@/lib/actions/appointments";
import { listActiveServices } from "@/lib/services";
import { listPatients } from "@/lib/patients";
import { isValidDateStr, todayDateStr } from "@/lib/datetime";
import { AppointmentForm } from "@/components/appointment-form";

export default async function NewAppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { date } = await searchParams;

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);
  if (!canBookAppointments(profile)) redirect(`/${locale}/appointments`);

  const [patients, services, practitioners] = await Promise.all([
    listPatients(),
    listActiveServices(),
    listPractitioners(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <AppointmentForm
        mode="create"
        action={createAppointment}
        defaultDate={isValidDateStr(date) ? date : todayDateStr()}
        patients={patients.map((p) => ({ id: p.id, name: p.name }))}
        services={services.map((s) => ({ id: s.id, name: s.name }))}
        practitioners={practitioners}
      />
    </div>
  );
}
