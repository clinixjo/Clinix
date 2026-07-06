import { cn } from "@/lib/utils";

/**
 * List rows (design system §6.7): hairline-separated rows instead of
 * per-item cards; comfortable touch height (≥44px).
 */
export function ListRows({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return <ul className={cn("divide-y divide-border", className)} {...props} />;
}

export function ListRow({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      className={cn("flex min-h-14 items-center gap-3 py-2", className)}
      {...props}
    />
  );
}
