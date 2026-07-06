import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0)).join("");
}

/** Initials avatar (design system §6.6): brand-100 bg, brand-800 text. */
export function UserAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-9", className)}>
      <AvatarFallback className="bg-brand-100 text-brand-800 text-sm font-medium">
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}
