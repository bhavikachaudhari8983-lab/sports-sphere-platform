"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Home, IdCard, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/events", label: "Live", icon: Trophy },
  { href: "/register", label: "Register", icon: ClipboardList },
  { href: "/status", label: "Account", icon: IdCard },
];

/** Student bottom navigation — mobile only. */
export function BottomNav() {
  const pathname = usePathname();
  // The wizard has its own sticky Next/Back bar.
  if (pathname.startsWith("/register")) return null;
  return (
    <nav aria-label="Primary" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface md:hidden">
      <ul className="grid grid-cols-4">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-small font-medium", active ? "text-fg" : "text-muted")}
              >
                <Icon className={cn("size-5", active && "text-primary")} aria-hidden />
                {label}
                {active && <span aria-hidden className="mt-0.5 h-0.5 w-6 rounded-full bg-accent" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
