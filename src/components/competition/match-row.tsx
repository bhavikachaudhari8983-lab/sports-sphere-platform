import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { PublicMatch } from "@/lib/public-home";
import { StatusPill } from "@/components/ui/status-pill";
import { cn, formatDateTime } from "@/lib/utils";

/** Team A vs Team B with the score, status and event. Links to the event's public results page. */
export function MatchRow({ m, onStage = false }: { m: PublicMatch; onStage?: boolean }) {
  const done = m.status === "COMPLETED" || m.status === "WALKOVER";
  const showScore = m.status === "LIVE" || (done && m.homeScore != null);
  const side = (s: PublicMatch["home"], won: boolean, align: "left" | "right") => (
    <span className={cn("min-w-0 flex-1", align === "right" && "text-right")}>
      <span className={cn("block truncate", won ? "font-black" : "font-semibold")}>{s?.name ?? "To be decided"}</span>
      {s?.institution && <span className={cn("block truncate text-small", onStage ? "text-stage-muted" : "text-muted")}>{s.institution}</span>}
    </span>
  );
  return (
    <Link
      href={`/events/${m.eventId}`}
      className={cn(
        "group flex flex-col gap-2 border-b px-1 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4",
        onStage ? "border-white/10 hover:bg-white/5" : "border-border hover:bg-surface-2",
      )}
    >
      <span className="flex shrink-0 items-center gap-2 sm:w-40">
        {m.status === "LIVE" ? (
          <StatusPill status="LIVE" />
        ) : done ? (
          <StatusPill status="FINAL" label={m.status === "WALKOVER" ? "Walkover" : "Final"} />
        ) : (
          <span className={cn("text-small font-bold tabular", onStage ? "text-stage-muted" : "text-muted")}>{m.scheduledAt ? formatDateTime(m.scheduledAt) : "Time to be set"}</span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        {side(m.home, m.winner === "HOME", "left")}
        <span className={cn("shrink-0 rounded px-2 py-0.5 text-center text-xl font-black tabular", showScore ? (onStage ? "bg-white/10" : "bg-surface-2") : "text-small font-bold text-muted")}>
          {showScore ? `${m.homeScore ?? 0} – ${m.awayScore ?? 0}` : "vs"}
        </span>
        {side(m.away, m.winner === "AWAY", "right")}
      </span>
      <span className={cn("flex shrink-0 items-center gap-1 text-small sm:w-56 sm:justify-end", onStage ? "text-stage-muted" : "text-muted")}>
        <span className="truncate">
          {m.sport} · {m.event} · {m.round}
        </span>
        <ChevronRight className="size-4 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden />
      </span>
    </Link>
  );
}
