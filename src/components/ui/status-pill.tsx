import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One look for every lifecycle status in the platform (tournaments, matches, registration windows).
 * Colour is never the only signal: each pill always carries its label.
 */
export type LifecycleStatus = "LIVE" | "UPCOMING" | "COMPLETED" | "FINAL" | "POSTPONED" | "CANCELLED" | "REG_OPEN" | "REG_CLOSED" | "DRAFT" | "ARCHIVED";

const LOOK: Record<LifecycleStatus, { label: string; className: string }> = {
  LIVE: { label: "Live", className: "bg-stage text-stage-fg" },
  UPCOMING: { label: "Upcoming", className: "bg-info-bg text-info-fg" },
  COMPLETED: { label: "Completed", className: "bg-neutral-bg text-neutral-fg" },
  FINAL: { label: "Final", className: "bg-success-bg text-success-fg" },
  POSTPONED: { label: "Postponed", className: "bg-warning-bg text-warning-fg" },
  CANCELLED: { label: "Cancelled", className: "border border-danger-fg/40 text-danger-fg" },
  REG_OPEN: { label: "Registration open", className: "bg-success-bg text-success-fg" },
  REG_CLOSED: { label: "Registration closed", className: "bg-neutral-bg text-neutral-fg" },
  DRAFT: { label: "Being set up", className: "bg-neutral-bg text-neutral-fg" },
  ARCHIVED: { label: "Archived", className: "bg-neutral-bg text-muted" },
};

export function StatusPill({ status, label, className }: { status: LifecycleStatus; label?: ReactNode; className?: string }) {
  const look = LOOK[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-small font-bold whitespace-nowrap", look.className, className)}>
      {status === "LIVE" && <span className="live-dot" aria-hidden />}
      {label ?? look.label}
    </span>
  );
}
