import { getTranslations, setRequestLocale } from "next-intl/server";
import { getProfile } from "@/lib/auth";
import { listStaff } from "@/lib/settings";
import type { InviteRole } from "@/lib/actions/staff";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { ListRow, ListRows } from "@/components/list-row";
import { UserAvatar } from "@/components/user-avatar";
import { InviteStaffDialog } from "@/components/settings/invite-staff-dialog";
import { StaffRowActions } from "@/components/settings/staff-row-actions";

export default async function StaffPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("staff");
  const profile = (await getProfile())!;
  const staff = await listStaff();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <InviteStaffDialog />
      </div>

      <Card>
        <CardContent>
          <ListRows>
            {staff.map((member) => {
              const isSelf = member.id === profile.id;
              const isOwner = member.role === "owner";
              const editable = !isSelf && !isOwner;
              return (
                <ListRow key={member.id} className="flex-wrap gap-y-2">
                  <UserAvatar name={member.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{member.name}</span>
                      {isSelf ? (
                        <StatusBadge variant="info">{t("you")}</StatusBadge>
                      ) : null}
                      {!member.is_active ? (
                        <StatusBadge variant="danger">{t("inactive")}</StatusBadge>
                      ) : null}
                    </div>
                    <span dir="ltr" className="block truncate text-sm text-muted-foreground">
                      {member.email ?? "—"}
                    </span>
                  </div>
                  {editable ? (
                    <StaffRowActions
                      userId={member.id}
                      role={member.role as InviteRole}
                      isActive={member.is_active}
                    />
                  ) : (
                    <StatusBadge variant="neutral">{t(`roles.${member.role}`)}</StatusBadge>
                  )}
                </ListRow>
              );
            })}
          </ListRows>
        </CardContent>
      </Card>
    </div>
  );
}
