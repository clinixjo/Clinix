import { cn } from "@/lib/utils";

/**
 * KPI card (design system §6.4): surface-1 background, no border,
 * small label above a prominent figure.
 */
export function MetricCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md bg-secondary p-4", className)}>
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-medium tabular-nums">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}
