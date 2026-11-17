import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireStaffPage } from "@/lib/rbac";
import { plannedMinutes } from "@/lib/match-management";
import { prisma } from "@/lib/prisma";
import { entrantsFor, matchesFor, sideOf, standings, suggestPlacings } from "@/lib/competition";
import { eligiblePlayers, representsLabel } from "@/lib/teams";
import { isFormat } from "@/lib/competition";
import { formatDob } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { CertificatesPanel, FormatForm, GenerateFixtures, MatchRow, PodiumForm, TeamsManager, type MatchView } from "@/components/competition/admin-panels";
import { StandingsTable } from "@/components/competition/standings-table";

export const metadata: Metadata = { title: "Event" };

export default async function CompetitionEvent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  await requireStaffPage(["ADMIN"], `/admin/competition/${eventId}`);
  const ev = await prisma.event.findUnique({ where: { id: eventId }, include: { sport: true, ageCategory: true } });
  if (!ev) notFound();
  const format = isFormat(ev.format) ? ev.format : null;
  const [teams, schools, matches, entrants, placings, certs, visiting, courts, officials, duties, matchExtras] = await Promise.all([
    prisma.team.findMany({
      where: { eventId },
      orderBy: { name: "asc" },
      include: { school: true, members: { include: { student: { select: { id: true, fullName: true, sportsId: true, playingPosition: true } } }, orderBy: { createdAt: "asc" } } },
    }),
    prisma.school.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    matchesFor(eventId),
    entrantsFor(eventId),
    prisma.placing.findMany({ where: { eventId }, orderBy: [{ division: "asc" }, { position: "asc" }] }),
    prisma.certificate.findMany({ where: { eventId }, orderBy: [{ kind: "asc" }, { recipient: "asc" }] }),
    prisma.student.findMany({ where: { status: "APPROVED", studentType: { not: "OUR_INDIAN" }, isOurUniversity: false, registrations: { some: { eventId } } }, select: { universityName: true }, distinct: ["universityName"] }),
    prisma.court.findMany({ where: { active: true, venue: { active: true } }, include: { venue: true }, orderBy: [{ venue: { name: "asc" } }, { name: "asc" }] }),
    prisma.staffUser.findMany({ where: { active: true, role: { in: ["OFFICIAL", "ADMIN", "SUPER_ADMIN"] } }, orderBy: [{ role: "asc" }, { name: "asc" }], select: { id: true, name: true, role: true } }),
    prisma.matchOfficial.findMany({ where: { match: { eventId } }, include: { staff: { select: { name: true } } } }),
    prisma.match.findMany({ where: { eventId }, select: { id: true, courtId: true, durationMin: true, statusReason: true } }),
  ]);
  const extras = new Map(matchExtras.map((x) => [x.id, x]));
  const dutyOf = (matchId: string, duty: string) => duties.find((d) => d.matchId === matchId && d.duty === duty);
  const defaultMinutes = plannedMinutes({ durationMin: null, event: ev });
  const eligible = new Map(await Promise.all(teams.map(async (t) => [t.id, await eligiblePlayers(t.id)] as const)));
  const suggestion = !ev.resultsFinal && placings.length === 0 && format !== "RACE" ? await suggestPlacings(eventId) : null;
  const divisions = [...new Set((entrants.length ? entrants : []).map((e) => e.division))].sort((a, b) => (a ?? "").localeCompare(b ?? "", undefined, { numeric: true }));
  const knockout = format === "KNOCKOUT";

  const view = (m: (typeof matches)[number]): MatchView => ({
    id: m.id,
    label: `${m.division ? `${m.division} · ` : ""}${m.roundLabel}`,
    division: m.division,
    home: sideOf(m, "HOME")?.name ?? null,
    away: sideOf(m, "AWAY")?.name ?? null,
    homeScore: m.homeScore, awayScore: m.awayScore, homeTiebreak: m.homeTiebreak, awayTiebreak: m.awayTiebreak,
    status: m.status, winner: m.winner, scheduledAt: m.scheduledAt?.toISOString() ?? null, bye: m.bye,
    version: m.updatedAt.toISOString(),
    courtId: extras.get(m.id)?.courtId ?? null,
    durationMin: extras.get(m.id)?.durationMin ?? null,
    statusReason: extras.get(m.id)?.statusReason ?? null,
    scorer: dutyOf(m.id, "SCOREKEEPER") ? { id: dutyOf(m.id, "SCOREKEEPER")!.staffId, name: dutyOf(m.id, "SCOREKEEPER")!.staff.name } : null,
    referee: dutyOf(m.id, "REFEREE") ? { id: dutyOf(m.id, "REFEREE")!.staffId, name: dutyOf(m.id, "REFEREE")!.staff.name } : null,
  });
  const manage = {
    courts: courts.map((c) => ({ id: c.id, label: `${c.venue.name} · ${c.name}` })),
    officials: officials.map((o) => ({ id: o.id, label: `${o.name}${o.role === "OFFICIAL" ? "" : " (admin)"}` })),
    defaultMinutes,
    knockout: format === "KNOCKOUT",
  };
  const played = matches.filter((m) => !m.bye && (m.status === "COMPLETED" || m.status === "WALKOVER")).length;
  const real = matches.filter((m) => !m.bye).length;
  const initialPlacings = (placings.length ? placings : suggestion?.placings ?? []).map((p) => ({ division: p.division, position: p.position, entrantKey: p.teamId ? `t:${p.teamId}` : `s:${p.studentId}`, mark: "mark" in p ? (p.mark ?? "") : "" }));
  const entrantOptions = entrants.map((e) => ({ key: e.teamId ? `t:${e.teamId}` : `s:${e.studentId}`, label: `${e.name} — ${e.institution}`, division: e.division }));
  const fixturesBlocked = !format ? "Choose a format first." : format === "RACE" ? undefined : entrants.length < 2 ? (ev.sport.isTeam ? "Create at least two teams." : "At least two approved athletes are needed.") : undefined;

  return (
    <div className="space-y-6">
      <Link href="/admin/competition" className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-medium text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Competition
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted">{ev.sport.name}</p>
          <h1 className="text-[clamp(1.75rem,4vw,2.5rem)] text-fg">{ev.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {ev.eventDate && <Badge>{formatDob(ev.eventDate)}</Badge>}
            {ev.venue && <Badge>{ev.venue}</Badge>}
            {ev.ageCategory && <Badge tone="info">{ev.ageCategory.name} only</Badge>}
            {ev.resultsFinal && <Badge tone="success">Results final</Badge>}
          </div>
        </div>
        <Link href={`/events/${ev.id}`} target="_blank" className={buttonClass("outline", "md")}>
          Public page <ExternalLink className="size-4" aria-hidden />
        </Link>
      </div>

      <Card>
        <CardHeader title="1. Format" description="How this event is played. Only approved athletes ever appear below." />
        <CardBody>
          <FormatForm eventId={ev.id} isTeam={ev.sport.isTeam} initial={{ format, periods: ev.periods, periodMinutes: ev.periodMinutes, shootout: ev.shootout, pointsWin: ev.pointsWin, pointsDraw: ev.pointsDraw, rosterMin: ev.rosterMin, rosterMax: ev.rosterMax }} />
        </CardBody>
      </Card>

      {ev.sport.isTeam && (
        <Card>
          <CardHeader title="2. Teams" description="Only approved athletes registered for this event can be picked. School squads only accept that school's students; a player can be in one squad per event." />
          <CardBody>
            <TeamsManager
              eventId={ev.id}
              rosterMin={ev.rosterMin}
              rosterMax={ev.rosterMax}
              schools={schools}
              colleges={visiting.map((v) => v.universityName).filter((v): v is string => !!v)}
              teams={teams.map((t) => ({
                id: t.id, name: t.name, shortName: t.shortName, represents: representsLabel(t), locked: !!t.lockedAt, captainId: t.captainId,
                members: t.members.map((m) => ({ id: m.student.id, name: m.student.fullName ?? "—", sportsId: m.student.sportsId, position: m.student.playingPosition })),
                eligible: (eligible.get(t.id) ?? []).map((p) => ({ id: p.id, label: `${p.fullName} · ${p.sportsId ?? ""}${p.playingPosition ? ` · ${p.playingPosition}` : ""}` })),
              }))}
            />
          </CardBody>
        </Card>
      )}

      {format !== "RACE" && (
        <Card>
          <CardHeader title={`${ev.sport.isTeam ? "3" : "2"}. Fixtures & results`} description={real ? `${played} of ${real} matches played` : "Generate the fixture list once entries are complete."} />
          <CardBody className="space-y-4">
            <GenerateFixtures eventId={ev.id} hasMatches={matches.length > 0} disabledReason={fixturesBlocked} />
            {divisions.map((d) => {
              const ms = matches.filter((m) => (m.division ?? null) === d && !(m.bye && knockout && m.round > 1));
              if (!ms.length) return null;
              return (
                <section key={d ?? "all"} className="space-y-2">
                  {d && <h3 className="text-lg">{d}</h3>}
                  {format === "LEAGUE" && (
                    <div className="rounded-xl border border-border p-3">
                      <StandingsTable rows={standings(ms, ev.pointsWin, ev.pointsDraw)} caption={`Standings${d ? ` ${d}` : ""}`} />
                    </div>
                  )}
                  <ul className="grid gap-2 lg:grid-cols-2">
                    {ms.filter((m) => !m.bye).map((m) => (
                      <MatchRow key={m.id} eventId={ev.id} m={view(m)} knockout={knockout} shootout={ev.shootout} manage={manage} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Final positions" description={format === "RACE" ? "Enter positions and marks (time, distance or score)." : "Suggested from the results — check, then finalise. Medals and the medal tally come from here."} />
        <CardBody className="space-y-3">
          {suggestion && suggestion.unfinished > 0 && <Alert tone="warning" title={`${suggestion.unfinished} match${suggestion.unfinished === 1 ? "" : "es"} still to play`}>Finalise once every match has a result.</Alert>}
          {entrants.length === 0 ? (
            <p className="text-muted">No entrants yet.</p>
          ) : (
            <PodiumForm key={`${ev.resultsFinal}-${placings.length}`} eventId={ev.id} initial={initialPlacings} entrants={entrantOptions} divisions={divisions.length ? divisions : [null]} final={ev.resultsFinal} race={format === "RACE"} />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Certificates" description="Participation for every approved athlete, medal certificates for the podium. Each has a QR code that opens a public verification page." />
        <CardBody>
          <CertificatesPanel eventId={ev.id} canIssue={ev.resultsFinal} certs={certs.map((c) => ({ code: c.code, recipient: c.recipient, kind: c.kind, division: c.division, revoked: !!c.revokedAt }))} />
        </CardBody>
      </Card>
    </div>
  );
}
