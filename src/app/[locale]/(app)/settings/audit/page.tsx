import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ScrollText } from "lucide-react";
import { listAuditLog } from "@/lib/audit";
import { Card, CardContent } from "@/components/ui/card";
import { ListRow, ListRows } from "@/components/list-row";

// Actions with a localized label; anything unmapped falls back to the raw code.
const KNOWN_ACTIONS = new Set([
  "medical_note_added",
  "medical_note_deleted",
  "staff_activated",
  "staff_deactivated",
  "staff_role_changed",
  "sale_status_changed",
  "sale_deleted",
  "patient_deleted",
  "patient_purged",
  "patient_exported",
]);

export default async function AuditPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("audit");
  const format = await getFormatter();
  const entries = await listAuditLog();

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-medium">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardContent>
          {entries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <ScrollText className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            </div>
          ) : (
            <ListRows>
              {entries.map((e) => (
                <ListRow key={e.id} className="flex-wrap gap-y-1">
                  <div className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {KNOWN_ACTIONS.has(e.action)
                        ? t(`actions.${e.action}`)
                        : e.action}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {e.actor?.name ?? t("system")}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format.dateTime(new Date(e.created_at), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </ListRow>
              ))}
            </ListRows>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
