"use client";

import { useTranslations } from "next-intl";
import {
  BarChart3,
  BellRing,
  Calendar,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { UserAvatar } from "@/components/user-avatar";

export type ShellProfile = {
  name: string;
  role: "owner" | "admin" | "receptionist" | "practitioner";
  clinicName: string;
  /** sales visibility follows the clinic's practitioner_can_edit rules */
  canSeeSales: boolean;
};

type NavItem = {
  key: "dashboard" | "patients" | "appointments" | "services" | "sales" | "followups" | "reports" | "settings";
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  visible: (p: ShellProfile) => boolean;
};

const managerRoles = new Set(["owner", "admin"]);

const navItems: NavItem[] = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, visible: () => true },
  { key: "patients", href: "/patients", icon: Users, visible: () => true },
  { key: "appointments", href: "/appointments", icon: Calendar, visible: () => true },
  { key: "services", href: "/services", icon: Sparkles, visible: () => true },
  { key: "sales", href: "/sales", icon: Receipt, visible: (p) => p.canSeeSales },
  { key: "followups", href: "/followups", icon: BellRing, visible: () => true },
  { key: "reports", href: "/reports", icon: BarChart3, visible: (p) => managerRoles.has(p.role) },
  { key: "settings", href: "/settings", icon: Settings, visible: (p) => managerRoles.has(p.role) },
];

export function AppShell({
  profile,
  children,
}: {
  profile: ShellProfile;
  children: React.ReactNode;
}) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tRoles = useTranslations("roles");
  const pathname = usePathname();

  const items = navItems.filter((item) => item.visible(profile));

  return (
    <div className="flex min-h-dvh w-full">
      {/* Desktop sidebar — on the inline-start edge (right in RTL) */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-e border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="text-lg font-semibold text-brand-800">
            {profile.clinicName}
          </span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {items.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 text-[15px] transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                )}
              >
                <Icon className="size-4.5 shrink-0" />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <UserAvatar name={profile.name} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{profile.name}</div>
              <div className="text-xs text-muted-foreground">
                {tRoles(profile.role)}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <LocaleSwitcher />
            <form action={signOut}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                aria-label={tCommon("signOut")}
              >
                <LogOut className="size-4" />
              </Button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile/tablet top bar */}
        <header className="flex items-center gap-2 border-b border-border bg-card px-4 py-3 lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("dashboard")}>
                <Menu className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={item.key} asChild>
                    <Link href={item.href} className="flex items-center gap-2">
                      <Icon className="size-4" />
                      {t(item.key)}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="flex-1 truncate font-semibold text-brand-800">
            {profile.clinicName}
          </span>
          <LocaleSwitcher />
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label={tCommon("signOut")}
            >
              <LogOut className="size-4" />
            </Button>
          </form>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
