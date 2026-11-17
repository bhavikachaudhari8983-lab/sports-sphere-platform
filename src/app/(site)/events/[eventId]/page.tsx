import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Medal, Radio } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { institutionOf, matchesFor, sideOf, standings, teamInstitution } from "@/lib/competition";
import { formatDateTime, formatDob, cn } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StandingsTable } from "@/components/competition/standings-table";
import { AutoRefresh } from "@/components/competition/auto-refresh";
import { StatusPill } from "@/components/ui/status-pill";

export const dynamic = "force-dynamic";

// No group-level loading.tsx in (site): with one, client navigation /events → a league event page was aborted (Next 15.5).
export const metadata: Metadata = { title: "Event results" };

const MEDAL = ["", "Gold", "Silver", "Bronze"];
const MEDAL_DOT = ["", "bg-[#C9A227]", "bg-[#9AA3AE]", "bg-[#B0703A]"];

export default async function PublicEvent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const ev = await prisma.event.findUnique({ where: { id: eventId, active: true }, include: { sport: true, ageCategory: true } });
  if (!ev) notFound();
  const [matches, placings] = await Promise.all([
    matchesFor(eventId),
    prisma.placing.findMany({
      where: { eventId },
      orderBy: [{ division: "asc" }, { position: "asc" }],
      include: { team: { include: { school: true } }, student: { select: { fullName: true, universityName: true, school: { select: { name: true } } } } },
    }),
  ]);
  const real = matches.filter((m) => !m.bye);
  const live = real.some((m) => m.status === "LIVE");
  const divisions = [...new Set(real.map((m) => m.division ?? null))];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 pb-24 sm:px-6 sm:py-12">
      <AutoRefresh active={live} />
      <Link href="/events" className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-medium text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> All events
      </Link>
      <div>
        <p className="text-muted">{ev.sport.name}</p>
        <h1 className="text-fg">{ev.name}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {ev.eventDate && <Badge>{formatDob(ev.eventDate)}</Badge>}
          {ev.venue && <Badge>{ev.venue}</Badge>}
          {ev.ageCategory && <Badge tone="info">{ev.ageCategory.name}</Badge>}
          {live && <Badge tone="danger" icon={<Radio className="size-3.5" aria-hidden />}>Live — updates automatically</Badge>}
          {ev.resultsFinal && <Badge tone="success">Final results</Badge>}
        </div>
      </div>

      {ev.resultsFinal && placings.length > 0 && (
        <Card>
          <CardHeader title="Podium" action={<Medal className="size-5 text-muted" aria-hidden />} />
          <CardBody>
            <ol className="space-y-2">
              {placings.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-full font-mono font-bold text-white", MEDAL_DOT[p.position] ?? "bg-muted")}>{p.position}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{p.team?.name ?? p.student?.fullName}</span>
                    <span className="block text-small text-muted">
                      {p.team ? teamInstitution(p.team) : p.student ? institutionOf(p.student) : ""}
                      {p.division ? ` · ${p.division}` : ""}
                      {p.mark ? ` · ${p.mark}` : ""}
                    </span>
                  </span>
                  {MEDAL[p.position] && <span className="text-small font-semibold">{MEDAL[p.position]}</span>}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}

      {divisions.map((d) => {
        const ms = real.filter((m) => (m.division ?? null) === d);
        return (
          <div key={d ?? "all"} className="space-y-4">
            {d && <h2 className="text-xl">{d}</h2>}
            {ev.format === "LEAGUE" && (
              <Card>
                <CardHeader title="Standings" />
                <CardBody>
                  <StandingsTable rows={standings(ms, ev.pointsWin, ev.pointsDraw)} caption={`${ev.name} standings`} />
                </CardBody>
              </Card>
            )}
            <Card>
              <CardHeader title="Schedule & results" />
              <ul className="divide-y divide-border">
                {ms.map((m) => {
                  const h = sideOf(m, "HOME"), a = sideOf(m, "AWAY");
                  return (
                    <li key={m.id} className="px-5 py-3">
                      <p className="flex flex-wrap gap-x-3 text-small text-muted">
                        <span>{m.roundLabel}</span>
                        {m.scheduledAt && <span>{formatDateTime(m.scheduledAt)}</span>}
                        {m.court && <span>{m.court.venue.name} · {m.court.name}</span>}
                        {m.status === "LIVE" && <span className="font-semibold text-danger-fg">● Live</span>}
                        {m.status === "POSTPONED" && <StatusPill status="POSTPONED" />}
                        {m.status === "CANCELLED" && <StatusPill status="CANCELLED" />}
                      </p>
                      {m.statusReason && (m.status === "POSTPONED" || m.status === "CANCELLED") && <p className="text-small text-warning-fg">{m.statusReason}</p>}
                      <p className="mt-1 flex items-center gap-3">
                        <span className={cn("min-w-0 flex-1 break-words", m.winner === "HOME" && "font-semibold")}>{h?.name ?? <span className="text-muted italic">To be decided</span>}</span>
                        <span className="shrink-0 font-mono font-semibold tabular">
                          {m.homeScore ?? "–"} : {m.awayScore ?? "–"}
                          {m.homeTiebreak != null && <span className="text-small font-normal text-muted"> ({m.homeTiebreak}–{m.awayTiebreak})</span>}
                        </span>
                        <span className={cn("min-w-0 flex-1 text-right break-words", m.winner === "AWAY" && "font-semibold")}>{a?.name ?? <span className="text-muted italic">To be decided</span>}</span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        );
      })}
      {real.length === 0 && !placings.length && <p className="text-muted">The schedule for this event hasn&apos;t been published yet.</p>}
    </div>
  );
}
