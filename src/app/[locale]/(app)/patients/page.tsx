import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Plus, Search, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { listPatients } from "@/lib/patients";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ListRow, ListRows } from "@/components/list-row";
import { UserAvatar } from "@/components/user-avatar";
import { isKnownSource } from "@/lib/patient-sources";

export default async function PatientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { q } = await searchParams;

  const t = await getTranslations("patients");
  const format = await getFormatter();
  const patients = await listPatients(q);
  const hasQuery = Boolean(q?.trim());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("count", { count: patients.length })}
          </p>
        </div>
        <Button asChild>
          <Link href="/patients/new">
            <Plus className="size-4" />
            {t("addPatient")}
          </Link>
        </Button>
      </div>

      {/* Plain GET form — search works with or without JS */}
      <form method="get" className="relative max-w-md">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder={t("searchPlaceholder")}
          className="ps-9"
          aria-label={t("searchPlaceholder")}
        />
      </form>

      <Card>
        <CardContent>
          {patients.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <UserRound className="size-8 text-muted-foreground" />
              {hasQuery ? (
                <p className="text-muted-foreground">
                  {t("noResults", { query: q!.trim() })}
                </p>
              ) : (
                <>
                  <p className="font-medium">{t("emptyTitle")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("emptyHint")}
                  </p>
                </>
              )}
            </div>
          ) : (
            <ListRows>
              {patients.map((patient) => (
                <ListRow key={patient.id} className="px-1">
                  <Link
                    href={`/patients/${patient.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <UserAvatar name={patient.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {patient.name}
                      </span>
                      <span dir="ltr" className="block truncate text-sm text-muted-foreground">
                        {patient.whatsapp ?? patient.phone ?? "—"}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-sm text-muted-foreground sm:block">
                      {patient.source
                        ? isKnownSource(patient.source)
                          ? t(`sources.${patient.source}`)
                          : patient.source
                        : ""}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {format.dateTime(new Date(patient.created_at), {
                        dateStyle: "medium",
                      })}
                    </span>
                  </Link>
                </ListRow>
              ))}
            </ListRows>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
