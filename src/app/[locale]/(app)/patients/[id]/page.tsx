import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Pencil, Receipt, ShieldCheck, ShieldAlert, Stethoscope } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { dirFor } from "@/i18n/routing";
import { getProfile } from "@/lib/auth";
import {
  ageFromDob,
  canAccessMedicalNotes,
  getMedicalNotes,
  getPatient,
  getVisits,
} from "@/lib/patients";
import { isKnownSource } from "@/lib/patient-sources";
import { canRecordSales } from "@/lib/sales";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { ListRow, ListRows } from "@/components/list-row";
import { UserAvatar } from "@/components/user-avatar";
import { DeletePatientButton } from "@/components/delete-patient-button";
import { MedicalNoteForm } from "@/components/medical-note-form";

export default async function PatientProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);

  const patient = await getPatient(id);
  if (!patient) notFound();

  const t = await getTranslations("patients");
  const tSales = await getTranslations("sales");
  const format = await getFormatter();
  const showMedical = canAccessMedicalNotes(profile.role);
  const isManager = profile.role === "owner" || profile.role === "admin";
  const showInvoice = canRecordSales(profile);

  const [visits, medicalNotes] = await Promise.all([
    getVisits(patient.id),
    showMedical ? getMedicalNotes(patient.id) : Promise.resolve([]),
  ]);

  const age = ageFromDob(patient.dob);
  const BackIcon = dirFor(locale) === "rtl" ? ArrowRight : ArrowLeft;

  const details: Array<{ label: string; value: React.ReactNode; ltr?: boolean }> = [
    {
      label: t("fields.age"),
      value: age !== null ? t("fields.ageValue", { age }) : "—",
    },
    {
      label: t("fields.gender"),
      value: patient.gender ? t(`fields.${patient.gender}`) : "—",
    },
    { label: t("fields.whatsapp"), value: patient.whatsapp ?? "—", ltr: true },
    { label: t("fields.phone"), value: patient.phone ?? "—", ltr: true },
    { label: t("fields.email"), value: patient.email ?? "—", ltr: true },
    {
      label: t("fields.source"),
      value: patient.source
        ? isKnownSource(patient.source)
          ? t(`sources.${patient.source}`)
          : patient.source
        : "—",
    },
  ];

  return (
    <div className="space-y-4">
      <Link
        href="/patients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <BackIcon className="size-4" />
        {t("profile.backToList")}
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <UserAvatar name={patient.name} className="size-12" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-semibold">{patient.name}</h1>
          {patient.consent_at ? (
            <StatusBadge variant="success">
              <ShieldCheck className="size-3" />
              {t("consent.consentedOn", {
                date: format.dateTime(new Date(patient.consent_at), {
                  dateStyle: "medium",
                }),
              })}
            </StatusBadge>
          ) : (
            <StatusBadge variant="warning">
              <ShieldAlert className="size-3" />
              {t("consent.noConsent")}
            </StatusBadge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showInvoice ? (
            <Button size="sm" asChild>
              <Link href={`/sales/new?patient=${patient.id}`}>
                <Receipt className="size-4" />
                {tSales("createInvoice")}
              </Link>
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" asChild>
            <Link href={`/patients/${patient.id}/edit`}>
              <Pencil className="size-4" />
              {t("form.editTitle")}
            </Link>
          </Button>
          {isManager ? (
            <DeletePatientButton
              patientId={patient.id}
              patientName={patient.name}
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle>{t("profile.details")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {details.map((item) => (
                <div key={item.label}>
                  <dt className="text-[13px] text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd
                    dir={item.ltr && item.value !== "—" ? "ltr" : undefined}
                    className="mt-0.5 text-sm"
                  >
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
            {patient.notes ? (
              <>
                <Separator className="my-4" />
                <dt className="text-[13px] text-muted-foreground">
                  {t("fields.notes")}
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm">
                  {patient.notes}
                </dd>
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Medical notes — owner/practitioner only (RLS enforces too) */}
        {showMedical ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="size-4 text-brand-600" />
                {t("profile.medicalNotesTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <MedicalNoteForm patientId={patient.id} />
              {medicalNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("profile.medicalNotesEmpty")}
                </p>
              ) : (
                <ListRows>
                  {medicalNotes.map((note) => (
                    <ListRow key={note.id} className="flex-col items-start gap-1">
                      <p className="whitespace-pre-wrap text-sm">{note.note}</p>
                      <p className="text-xs text-muted-foreground">
                        {note.author
                          ? `${t("profile.noteBy", { name: note.author.name })} · `
                          : ""}
                        {t("profile.addedOn", {
                          date: format.dateTime(new Date(note.created_at), {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }),
                        })}
                      </p>
                    </ListRow>
                  ))}
                </ListRows>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* Visit history — fills up from M3 (completed appointments) */}
        <Card className={showMedical ? "lg:col-span-2" : ""}>
          <CardHeader>
            <CardTitle>{t("profile.visitsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {visits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("profile.visitsEmpty")}
              </p>
            ) : (
              <ListRows>
                {visits.map((visit) => (
                  <ListRow key={visit.id}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {visit.service?.name ?? "—"}
                      </span>
                      {visit.practitioner ? (
                        <span className="block text-sm text-muted-foreground">
                          {visit.practitioner.name}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {format.dateTime(new Date(visit.visit_date), {
                        dateStyle: "medium",
                      })}
                    </span>
                  </ListRow>
                ))}
              </ListRows>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
