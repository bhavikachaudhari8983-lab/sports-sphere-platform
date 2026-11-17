"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ShieldCheck } from "lucide-react";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { staffHomeFor } from "@/lib/staff-home";
import { roleSatisfies } from "@/lib/constants";

const links = [
  { href: "/", label: "Home" },
  { href: "/events", label: "Live & results" },
  { href: "/register", label: "Register" },
  { href: "/status", label: "My account" },
  { href: "/privacy", label: "Privacy" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { data } = useSession();
  const role = data?.user?.role;
  const staffHome = role && role !== "STUDENT" ? staffHomeFor(role) : null;

  return (
    <header className="sticky top-0 z-40 bg-surface text-fg shadow-card">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-lg px-3 font-medium text-muted hover:bg-surface-2 hover:text-fg",
                  active && "bg-surface-2 text-fg shadow-[inset_0_-3px_0_var(--accent)]",
                  // Tablet width can't fit five links; Privacy stays in the footer there.
                  l.href === "/privacy" && "md:hidden lg:flex",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-1">
          <ThemeToggle className="text-fg hover:bg-surface-2" />
          {staffHome ? (
            <Link href={staffHome} className={buttonClass("outline", "sm")}>
              <ShieldCheck className="size-4" aria-hidden />
              <span className="hidden sm:inline">{roleSatisfies(role, ["ADMIN"]) ? "Dashboard" : "Staff area"}</span>
            </Link>
          ) : (
            <Link href="/staff/login" aria-label="Staff login" className="flex min-h-11 items-center rounded-lg px-2 text-small font-semibold whitespace-nowrap text-primary hover:bg-surface-2 sm:px-3">
              Staff<span className="hidden sm:inline">&nbsp;login</span>
            </Link>
          )}
        </div>
      </div>
      <div aria-hidden className="brand-stripe" />
    </header>
  );
}

