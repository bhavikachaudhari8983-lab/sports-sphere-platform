"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import {
  CalendarRange,
  MapPin,
  ClipboardCheck,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Medal,
  Megaphone,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  ScanLine,
  ScrollText,
  Settings,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { ROLE_LABEL, roleSatisfies, type StaffRole } from "@/lib/constants";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; roles: StaffRole[]; exact?: boolean };

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN"], exact: true },
  { href: "/admin/ready", label: "Ready to approve", icon: ListChecks, roles: ["ADMIN"] },
  { href: "/admin/tournaments", label: "Tournaments", icon: CalendarRange, roles: ["ADMIN"] },
  { href: "/admin/sports", label: "Sports & events", icon: Trophy, roles: ["ADMIN"] },
  { href: "/admin/competition", label: "Competition", icon: Medal, roles: ["ADMIN"] },
  { href: "/admin/venues", label: "Venues & courts", icon: MapPin, roles: ["ADMIN"] },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone, roles: ["ADMIN"] },
  { href: "/desk", label: "Verification desk", icon: ClipboardCheck, roles: ["ADMIN", "OFFICIAL"] },
  { href: "/scan", label: "QR scanner", icon: ScanLine, roles: ["ADMIN", "OFFICIAL"] },
  { href: "/score", label: "Live scoring", icon: Radio, roles: ["ADMIN", "OFFICIAL"] },
  { href: "/medical", label: "Medical", icon: HeartPulse, roles: ["MEDICAL"] },
  { href: "/coach", label: "My players", icon: Users, roles: ["COACH"] },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText, roles: ["ADMIN"] },
  { href: "/admin/settings", label: "Settings", icon: Settings, roles: ["ADMIN"] },
];

const COLLAPSE_KEY = "srp-sidebar-collapsed";

export function StaffShell({ user, children }: { user: { name: string; role: StaffRole }; children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  }

  const items = NAV.filter((n) => roleSatisfies(user.role, n.roles));

  const nav = (isCollapsed: boolean) => (
    <ul className="space-y-1">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              title={isCollapsed ? label : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 font-medium text-muted hover:bg-surface-2 hover:text-fg",
                active && "bg-tint font-semibold text-fg shadow-[inset_3px_0_0_var(--accent)]",
                isCollapsed && "justify-center px-0",
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className={cn(isCollapsed && "sr-only")}>{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const userBlock = (isCollapsed: boolean) => (
    <div className="space-y-2 border-t border-border pt-3">
      {!isCollapsed && (
        <div className="px-3 text-small">
          <p className="truncate font-semibold text-fg">{user.name}</p>
          <p className="text-muted">{ROLE_LABEL[user.role]}</p>
        </div>
      )}
      <div className={cn("flex items-center gap-1", isCollapsed && "flex-col")}>
        <ThemeToggle className="text-fg hover:bg-surface-2" />
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/staff/login" })}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-muted hover:bg-surface-2 hover:text-fg"
        >
          <LogOut className="size-5" aria-hidden />
          <span className={cn(isCollapsed && "sr-only")}>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-20 print:hidden items-center justify-between gap-2 border-b border-border bg-surface px-4 text-fg shadow-card lg:hidden">
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="staff-drawer" className="-ml-2 grid size-11 place-items-center rounded-lg hover:bg-surface-2">
          <Menu className="size-6" aria-hidden />
        </button>
        <Logo href="/" stacked />
        <ThemeToggle className="text-fg hover:bg-surface-2" />
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Staff navigation" id="staff-drawer">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 bg-surface p-4 text-fg">
            <div className="flex items-center justify-between">
              <Logo stacked />
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="grid size-11 place-items-center rounded-lg hover:bg-surface-2">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <nav aria-label="Staff" className="flex-1 overflow-y-auto">
              {nav(false)}
            </nav>
            {userBlock(false)}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col gap-4 border-r border-border bg-surface p-3 text-fg transition-[width] lg:flex print:hidden",
          collapsed ? "w-20" : "w-64",
        )}
      >
        <div className={cn("flex items-center gap-2", collapsed ? "justify-center" : "justify-between pl-1")}>
          {!collapsed && <Logo stacked />}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="grid size-11 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
          >
            {collapsed ? <PanelLeftOpen className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
          </button>
        </div>
        <nav aria-label="Staff" className="flex-1 overflow-y-auto">
          {nav(collapsed)}
        </nav>
        {userBlock(collapsed)}
      </aside>

      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:p-0">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}

