// Real data for the public home page. Only public information: names and institutions, never IDs, ages or contacts.
import { prisma } from "./prisma";
import { sideOf } from "./competition";
import { registrationWindowProblem } from "./tournaments";

export type PublicSide = { name: string; institution: string } | null;
export type PublicMatch = {
  id: string;
  eventId: string;
  status: string; // SCHEDULED | LIVE | COMPLETED | WALKOVER
  home: PublicSide;
  away: PublicSide;
  homeScore: number | null;
  awayScore: number | null;
  winner: string | null; // HOME | AWAY | DRAW
  scheduledAt: string | null;
  sport: string;
  event: string;
  round: string;
};
export type OpenTournament = {
  id: string;
  name: string;
  season: string;
  startDate: string | null;
  endDate: string | null;
  closesAt: string | null;
  sports: string[];
  events: number;
};

// Same shape as competition.matchesFor(), so sideOf() can read it.
const sides = {
  event: { include: { sport: true } },
  homeTeam: { include: { school: true } },
  awayTeam: { include: { school: true } },
  homeStudent: { select: { id: true, fullName: true, universityName: true, school: { select: { name: true } } } },
  awayStudent: { select: { id: true, fullName: true, universityName: true, school: { select: { name: true } } } },
} as const;

type Row = Awaited<ReturnType<typeof loadMatches>>[number];
function loadMatches(where: object, orderBy: object, take: number) {
  return prisma.match.findMany({ where: { bye: false, event: { active: true }, ...where }, orderBy, take, include: sides });
}

function toPublic(m: Row): PublicMatch {
  const side = (s: "HOME" | "AWAY"): PublicSide => {
    const v = sideOf(m, s);
    return v ? { name: v.name, institution: v.institution } : null;
  };
  return {
    id: m.id, eventId: m.eventId, status: m.status, home: side("HOME"), away: side("AWAY"),
    homeScore: m.homeScore, awayScore: m.awayScore, winner: m.winner, scheduledAt: m.scheduledAt?.toISOString() ?? null,
    sport: m.event.sport.name, event: m.event.name, round: m.roundLabel,
  };
}

export async function getHomeData() {
  const now = new Date();
  const [live, upcoming, results, tournaments] = await Promise.all([
    loadMatches({ status: "LIVE" }, { updatedAt: "desc" }, 6),
    loadMatches({ status: "SCHEDULED", scheduledAt: { gte: now }, OR: [{ homeTeamId: { not: null } }, { homeStudentId: { not: null } }] }, { scheduledAt: "asc" }, 4),
    loadMatches({ status: { in: ["COMPLETED", "WALKOVER"] } }, { updatedAt: "desc" }, 4),
    prisma.tournament.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ registrationClosesAt: "asc" }, { startDate: "asc" }],
      include: { events: { where: { active: true }, select: { sport: { select: { name: true } } } } },
    }),
  ]);
  const open: OpenTournament[] = tournaments
    .filter((t) => t.events.length > 0 && !registrationWindowProblem(t, now))
    .map((t) => ({
      id: t.id, name: t.name, season: t.season, startDate: t.startDate, endDate: t.endDate,
      closesAt: t.registrationClosesAt?.toISOString() ?? null,
      sports: [...new Set(t.events.map((e) => e.sport.name))].sort(),
      events: t.events.length,
    }));
  // Upcoming matches need both sides known (an undecided knockout slot isn't worth showing).
  const ready = (m: Row) => (m.homeTeamId || m.homeStudentId) && (m.awayTeamId || m.awayStudentId);
  return {
    live: live.filter(ready).map(toPublic),
    upcoming: upcoming.filter(ready).map(toPublic),
    results: results.map(toPublic),
    open,
  };
}
