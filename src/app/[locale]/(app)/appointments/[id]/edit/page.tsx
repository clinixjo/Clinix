import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import {
  canBookAppointments,
  getAppointment,
  listPractitioners,
} from "@/lib/appointments";
import { updateAppointment } from "@/lib/actions/appointments";
import { listActiveServices } from "@/lib/services";
import { listPatients } from "@/lib/patients";
import { AppointmentForm } from "@/components/appointment-form";

export default async function EditAppointmentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);
  if (!canBookAppointments(profile)) redirect(`/${locale}/appointments`);

  const [appointment, patients, services, practitioners] = await Promise.all([
    getAppointment(id),
    listPatients(),
    listActiveServices(),
    listPractitioners(),
  ]);
  if (!appointment) notFound();

  const updateAction = updateAppointment.bind(null, appointment.id);

  return (
    <div className="mx-auto max-w-2xl">
      <AppointmentForm
        mode="edit"
        action={updateAction}
        initial={appointment}
        patients={patients.map((p) => ({ id: p.id, name: p.name }))}
        services={services.map((s) => ({ id: s.id, name: s.name }))}
        practitioners={practitioners}
      />
    </div>
  );
}
