import { CalendarRange, Trophy } from "lucide-react";
import type { OpenTournament } from "@/lib/public-home";
import { StatusPill } from "@/components/ui/status-pill";
import { ButtonLink } from "@/components/ui/button";

const fmtDate = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const fmtClose = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** A tournament whose registration is open: dates, sports, closing time, and the way in. */
export function TournamentCard({ t }: { t: OpenTournament }) {
  const daysLeft = t.closesAt ? Math.ceil((new Date(t.closesAt).getTime() - Date.now()) / 86_400_000) : null;
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status="REG_OPEN" />
        {daysLeft != null && daysLeft <= 7 && <span className="text-small font-bold text-tint-fg">{daysLeft <= 1 ? "Closes within a day" : `Closes in ${daysLeft} days`}</span>}
      </div>
      <div>
        <h3 className="text-xl font-black">{t.name}</h3>
        <p className="mt-1 text-small text-muted">Season {t.season}</p>
      </div>
      <dl className="grid gap-2 text-small">
        <div className="flex items-start gap-2">
          <dt className="sr-only">Dates</dt>
          <CalendarRange className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <dd>{t.startDate ? `${fmtDate(t.startDate)}${t.endDate && t.endDate !== t.startDate ? ` to ${fmtDate(t.endDate)}` : ""}` : "Dates to be announced"}</dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="sr-only">Sports</dt>
          <Trophy className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <dd>
            {t.sports.slice(0, 5).join(", ")}
            {t.sports.length > 5 ? ` and ${t.sports.length - 5} more` : ""} · {t.events} event{t.events === 1 ? "" : "s"}
          </dd>
        </div>
      </dl>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-small">
          {t.closesAt ? (
            <>
              Registration closes <strong>{fmtClose(t.closesAt)}</strong>
            </>
          ) : (
            "No closing date set"
          )}
        </p>
        <ButtonLink href="/register" size="sm">
          Register
        </ButtonLink>
      </div>
    </article>
  );
}
