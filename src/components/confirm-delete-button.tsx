"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Generic destructive-action confirmation. The parent (server component)
 * passes a bound server action and already-translated labels so this stays
 * namespace-agnostic and reusable across the catalog.
 */
export function ConfirmDeleteButton({
  action,
  triggerLabel,
  title,
  description,
  confirmLabel,
  cancelLabel,
  size = "sm",
  iconOnly = false,
}: {
  action: () => Promise<void>;
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  size?: "sm" | "icon";
  iconOnly?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="destructive"
          size={size}
          disabled={pending}
          aria-label={iconOnly ? triggerLabel : undefined}
        >
          <Trash2 className="size-4" />
          {iconOnly ? null : triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => startTransition(() => action())}
            className="bg-danger text-white hover:bg-danger/90"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
