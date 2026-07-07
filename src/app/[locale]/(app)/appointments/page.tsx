import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { dirFor } from "@/i18n/routing";
import { getProfile } from "@/lib/auth";
import {
  canBookAppointments,
  listAppointmentsInRange,
  type AppointmentRow,
} from "@/lib/appointments";
import { deleteAppointment } from "@/lib/actions/appointments";
import {
  addDaysStr,
  APPT_TZ,
  dayRange,
  isValidDateStr,
  todayDateStr,
  weekRange,
} from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListRow, ListRows } from "@/components/list-row";
import { StatusBadge, appointmentStatusVariant } from "@/components/status-badge";
import { AppointmentStatusMenu } from "@/components/appointment-status-menu";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";

type View = "day" | "week";

function apptHref(view: View, date: string) {
  return `/appointments?view=${view}&date=${date}`;
}

export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const profile = await getProfile();
  if (!profile) redirect(`/${locale}/login`);

  const t = await getTranslations("appointments");
  const tCommon = await getTranslations("common");
  const format = await getFormatter();

  const view: View = sp.view === "week" ? "week" : "day";
  const date = isValidDateStr(sp.date) ? sp.date : todayDateStr();
  const canBook = canBookAppointments(profile);

  const range = view === "week" ? weekRange(date) : dayRange(date);
  const appointments = await listAppointmentsInRange(range.startISO, range.endISO);

  const step = view === "week" ? 7 : 1;
  const prevDate = addDaysStr(date, -step);
  const nextDate = addDaysStr(date, step);
  const NavPrev = dirFor(locale) === "rtl" ? ChevronRight : ChevronLeft;
  const NavNext = dirFor(locale) === "rtl" ? ChevronLeft : ChevronRight;

  const time = (iso: string) =>
    format.dateTime(new Date(iso), { hour: "numeric", minute: "2-digit", timeZone: APPT_TZ });

  const rangeLabel =
    view === "week"
      ? `${format.dateTime(new Date(`${(range as ReturnType<typeof weekRange>).days[0]}T00:00:00Z`), { day: "numeric", month: "short", timeZone: APPT_TZ })} – ${format.dateTime(new Date(`${(range as ReturnType<typeof weekRange>).days[6]}T00:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: APPT_TZ })}`
      : format.dateTime(new Date(`${date}T00:00:00Z`), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: APPT_TZ });

  function ApptRow({ appt }: { appt: AppointmentRow }) {
    return (
      <ListRow className="flex-wrap gap-y-2">
        <div className="w-20 shrink-0 tabular-nums" dir="ltr">
          <div className="font-medium">{time(appt.start_at)}</div>
          <div className="text-xs text-muted-foreground">{time(appt.end_at)}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">
              {appt.patient?.name ?? "—"}
            </span>
            <StatusBadge variant={appointmentStatusVariant[appt.status]}>
              {t(`statuses.${appt.status}`)}
            </StatusBadge>
          </div>
          <div className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
            <span>{appt.service?.name ?? "—"}</span>
            <span>·</span>
            <span>{appt.practitioner?.name ?? t("unassigned")}</span>
          </div>
        </div>
        {canBook ? (
          <div className="flex items-center gap-1">
            <AppointmentStatusMenu appointmentId={appt.id} current={appt.status} />
            <Button variant="ghost" size="icon" asChild>
              <Link
                href={`/appointments/${appt.id}/edit`}
                aria-label={t("form.editTitle")}
              >
                <Pencil className="size-4" />
              </Link>
            </Button>
            <ConfirmDeleteButton
              action={deleteAppointment.bind(null, appt.id)}
              triggerLabel={t("delete.action")}
              title={t("delete.confirmTitle")}
              description={t("delete.confirmText", {
                patient: appt.patient?.name ?? "—",
              })}
              confirmLabel={t("delete.confirm")}
              cancelLabel={tCommon("cancel")}
              size="icon"
              iconOnly
            />
          </div>
        ) : null}
      </ListRow>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("count", { count: appointments.length })}
          </p>
        </div>
        {canBook ? (
          <Button asChild>
            <Link href={`/appointments/new?date=${date}`}>
              <Plus className="size-4" />
              {t("book")}
            </Link>
          </Button>
        ) : null}
      </div>

      {/* View toggle + date navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-border p-0.5">
          <Button
            variant={view === "day" ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link href={apptHref("day", date)}>{t("day")}</Link>
          </Button>
          <Button
            variant={view === "week" ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link href={apptHref("week", date)}>{t("week")}</Link>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild aria-label={t("prev")}>
            <Link href={apptHref(view, prevDate)}>
              <NavPrev className="size-4" />
            </Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link href={apptHref(view, todayDateStr())}>{t("today")}</Link>
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label={t("next")}>
            <Link href={apptHref(view, nextDate)}>
              <NavNext className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <p className="text-sm font-medium">{rangeLabel}</p>

      {!canBook ? (
        <p className="text-sm text-muted-foreground">{t("viewOnlyHint")}</p>
      ) : null}

      {view === "day" ? (
        <Card>
          <CardContent>
            {appointments.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <CalendarDays className="size-8 text-muted-foreground" />
                <p className="text-muted-foreground">{t("emptyDay")}</p>
              </div>
            ) : (
              <ListRows>
                {appointments.map((appt) => (
                  <ApptRow key={appt.id} appt={appt} />
                ))}
              </ListRows>
            )}
          </CardContent>
        </Card>
      ) : (
        <WeekGrid
          days={(range as ReturnType<typeof weekRange>).days}
          appointments={appointments}
          date={date}
        />
      )}
    </div>
  );

  function WeekGrid({
    days,
    appointments,
    date,
  }: {
    days: string[];
    appointments: AppointmentRow[];
    date: string;
  }) {
    const byDay = new Map<string, AppointmentRow[]>();
    for (const day of days) byDay.set(day, []);
    for (const appt of appointments) {
      const key = appt.start_at.slice(0, 10);
      byDay.get(key)?.push(appt);
    }

    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((day) => {
          const dayAppts = byDay.get(day) ?? [];
          const isToday = day === todayDateStr();
          const isCurrent = day === date;
          return (
            <Card
              key={day}
              className={isCurrent ? "border-brand-200" : undefined}
            >
              <CardHeader className="p-3">
                <CardTitle className="text-sm">
                  <Link
                    href={apptHref("day", day)}
                    className="flex items-baseline justify-between gap-1 hover:text-brand-600"
                  >
                    <span>
                      {format.dateTime(new Date(`${day}T00:00:00Z`), {
                        weekday: "short",
                        timeZone: APPT_TZ,
                      })}
                    </span>
                    <span
                      className={
                        isToday
                          ? "text-brand-600 tabular-nums"
                          : "text-muted-foreground tabular-nums"
                      }
                    >
                      {format.dateTime(new Date(`${day}T00:00:00Z`), {
                        day: "numeric",
                        timeZone: APPT_TZ,
                      })}
                    </span>
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 p-3 pt-0">
                {dayAppts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">—</p>
                ) : (
                  dayAppts.map((appt) => (
                    <Link
                      key={appt.id}
                      href={`/appointments/${appt.id}/edit`}
                      className="block rounded-md bg-secondary p-1.5 text-xs hover:bg-accent"
                    >
                      <span dir="ltr" className="block font-medium tabular-nums">
                        {time(appt.start_at)}
                      </span>
                      <span className="block truncate text-muted-foreground">
                        {appt.patient?.name ?? "—"}
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }
}
