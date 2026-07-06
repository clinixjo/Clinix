import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Status pill using the semantic palette (design system §2.3/§2.4).
 * Never rely on color alone — always pass a text label as children.
 */
const statusBadgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        info: "bg-info-bg text-info-fg",
        success: "bg-success-bg text-success-fg",
        warning: "bg-warning-bg text-warning-fg",
        danger: "bg-danger-bg text-danger-fg",
        neutral: "bg-neutral-status-bg text-neutral-status-fg",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

/** Appointment status → semantic variant (design system §2.4) */
export const appointmentStatusVariant = {
  scheduled: "info",
  confirmed: "success",
  completed: "neutral",
  no_show: "danger",
  cancelled: "danger",
} as const satisfies Record<
  string,
  VariantProps<typeof statusBadgeVariants>["variant"]
>;

export function StatusBadge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof statusBadgeVariants>) {
  return (
    <span
      className={cn(statusBadgeVariants({ variant }), className)}
      {...props}
    />
  );
}
