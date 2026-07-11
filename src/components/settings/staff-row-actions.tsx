"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { setStaffActive, setStaffRole, type InviteRole } from "@/lib/actions/staff";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLES: InviteRole[] = ["admin", "practitioner", "receptionist"];

export function StaffRowActions({
  userId,
  role,
  isActive,
}: {
  userId: string;
  role: InviteRole;
  isActive: boolean;
}) {
  const t = useTranslations("staff");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Select
        value={role}
        disabled={pending}
        onValueChange={(v) => startTransition(() => setStaffRole(userId, v as InviteRole))}
      >
        <SelectTrigger className="h-9 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {t(`roles.${r}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant={isActive ? "ghost" : "secondary"}
        size="sm"
        disabled={pending}
        onClick={() => startTransition(() => setStaffActive(userId, !isActive))}
      >
        {isActive ? t("deactivate") : t("activate")}
      </Button>
    </div>
  );
}
