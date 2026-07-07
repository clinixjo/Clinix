"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, CircleCheck, CircleX, UserX } from "lucide-react";
import { setAppointmentStatus } from "@/lib/actions/appointments";
import type { AppointmentStatus } from "@/lib/appointments";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TRANSITIONS: {
  status: AppointmentStatus;
  key: "confirm" | "complete" | "markNoShow" | "cancel";
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { status: "confirmed", key: "confirm", icon: Check },
  { status: "completed", key: "complete", icon: CircleCheck },
  { status: "no_show", key: "markNoShow", icon: UserX },
  { status: "cancelled", key: "cancel", icon: CircleX },
];

export function AppointmentStatusMenu({
  appointmentId,
  current,
}: {
  appointmentId: string;
  current: AppointmentStatus;
}) {
  const t = useTranslations("appointments.actions");
  const [pending, startTransition] = useTransition();

  const options = TRANSITIONS.filter((tr) => tr.status !== current);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" disabled={pending}>
          {t("changeStatus")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map(({ status, key, icon: Icon }) => (
          <DropdownMenuItem
            key={status}
            onSelect={() =>
              startTransition(() =>
                setAppointmentStatus(appointmentId, status)
              )
            }
          >
            <Icon className="size-4" />
            {t(key)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
