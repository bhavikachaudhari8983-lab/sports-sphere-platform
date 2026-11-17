// Running an event after registration: entrants → fixtures → results → standings → podium → medal tally.
// Only APPROVED athletes ever appear here, so every fixture is between verified, eligible people.
import { prisma } from "./prisma";
import { audit, type Actor } from "./audit";
import { ApiError } from "./api";
import { UNIVERSITY_NAME, type Format } from "./constants";

export type Entrant = { teamId: string | null; studentId: string | null; name: string; institution: string; division: string | null };

const NO_DIVISION = "";
const divKey = (d: string | null | undefined) => d ?? NO_DIVISION;

/** Institution shown on tables and the medal tally: a host-university school, or the outside college. */
export function institutionOf(s: { school?: { name: string } | null; universityName?: string | null }): string {
  return s.school?.name ?? s.universityName ?? UNIVERSITY_NAME;
}
export function teamInstitution(t: { school?: { name: string } | null; collegeName?: string | null }): string {
  return t.school?.name ?? t.collegeName ?? UNIVERSITY_NAME;
}

async function loadEvent(eventId: string) {
  const ev = await prisma.event.findUnique({ where: { id: eventId }, include: { sport: true } });
  if (!ev) throw new ApiError(404, "Event not found");
  return ev;
}

/** Who competes: teams for team sports, approved registered athletes otherwise (grouped by weight class). */
export async function entrantsFor(eventId: string): Promise<Entrant[]> {
  const ev = await loadEvent(eventId);
  if (ev.sport.isTeam) {
    const teams = await prisma.team.findMany({ where: { eventId }, include: { school: true }, orderBy: { name: "asc" } });
    return teams.map((t) => ({ teamId: t.id, studentId: null, name: t.name, institution: teamInstitution(t), division: null }));
  }
  const regs = await prisma.registration.findMany({
    where: { eventId, student: { status: "APPROVED" } },
    include: { weightCategory: true, student: { select: { id: true, fullName: true, universityName: true, school: { select: { name: true } } } } },
  });
  return regs
    .map((r) => ({ teamId: null, studentId: r.student.id, name: r.student.fullName ?? "—", institution: institutionOf(r.student), division: ev.sport.isWeightCategory ? (r.weightCategory?.name ?? null) : null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

type NewMatch = { division: string | null; round: number; roundLabel: string; slot: number; home: Entrant | null; away: Entrant | null; bye?: boolean; key: string; nextKey?: string; nextSide?: "HOME" | "AWAY" };

/** Circle method: everyone plays everyone once. */
export function roundRobin(entrants: Entrant[], division: string | null): NewMatch[] {
  const list: Array<Entrant | null> = [...entrants];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const out: NewMatch[] = [];
  for (let r = 0; r < n - 1; r++) {
    let slot = 0;
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) out.push({ division, round: r + 1, roundLabel: `Matchday ${r + 1}`, slot: ++slot, home: r % 2 ? b : a, away: r % 2 ? a : b, key: `${divKey(division)}:${r}:${i}` });
    }
    list.splice(1, 0, list.pop() ?? null); // rotate all but the first
  }
  return out;
}

const KO_LABEL = (roundsLeft: number) => (roundsLeft === 1 ? "Final" : roundsLeft === 2 ? "Semi-final" : roundsLeft === 3 ? "Quarter-final" : `Round of ${2 ** roundsLeft}`);

/** Single-elimination bracket. Byes go to the top seeds (entrant order) and advance automatically. */
export function knockout(entrants: Entrant[], division: string | null): NewMatch[] {
  if (entrants.length < 2) return [];
  const rounds = Math.ceil(Math.log2(entrants.length));
  const size = 2 ** rounds;
  // Standard seeding order so seeds 1 and 2 can only meet in the final.
  let order = [1];
  while (order.length < size) order = order.flatMap((s) => [s, order.length * 2 + 1 - s]);
  const seeded = order.map((seed) => entrants[seed - 1] ?? null);
  const out: NewMatch[] = [];
  const d = divKey(division);
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r;
    for (let i = 0; i < count; i++) {
      const m: NewMatch = { division, round: r, roundLabel: KO_LABEL(rounds - r + 1), slot: i + 1, home: null, away: null, key: `${d}:${r}:${i}` };
      if (r < rounds) {
        m.nextKey = `${d}:${r + 1}:${Math.floor(i / 2)}`;
        m.nextSide = i % 2 ? "AWAY" : "HOME";
      }
      if (r === 1) {
        m.home = seeded[i * 2];
        m.away = seeded[i * 2 + 1];
        m.bye = !m.home || !m.away;
      }
      out.push(m);
    }
  }
  return out;
}

const sideData = (e: Entrant | null, side: "home" | "away") =>
  side === "home" ? { homeTeamId: e?.teamId ?? null, homeStudentId: e?.studentId ?? null } : { awayTeamId: e?.teamId ?? null, awayStudentId: e?.studentId ?? null };

/** Replaces the fixture list. Refused once any match has started, so results are never lost by accident. */
export async function generateFixtures(eventId: string, actor: Actor, ip: string | null) {
  const ev = await loadEvent(eventId);
  if (ev.format !== "LEAGUE" && ev.format !== "KNOCKOUT") throw new ApiError(400, "Choose League or Knockout first. Ranked-results events don't have fixtures.");
  if (await prisma.match.count({ where: { eventId, status: { in: ["LIVE", "COMPLETED"] }, bye: false } })) throw new ApiError(409, "Matches have already been played. Fixtures can't be regenerated.");
  const entrants = await entrantsFor(eventId);
  const byDiv = new Map<string, Entrant[]>();
  for (const e of entrants) byDiv.set(divKey(e.division), [...(byDiv.get(divKey(e.division)) ?? []), e]);
  const planned = [...byDiv.entries()].flatMap(([d, list]) => (list.length < 2 ? [] : ev.format === "LEAGUE" ? roundRobin(list, d || null) : knockout(list, d || null)));
  if (!planned.length) throw new ApiError(400, ev.sport.isTeam ? "Create at least two teams first." : "At least two approved athletes are needed (per weight class).");

  // Simple timetable: from the event date at 09:00 IST, one slot per round.
  const slotMinutes = ev.periods && ev.periodMinutes ? ev.periods * ev.periodMinutes + 20 : 45;
  const start = ev.eventDate ? new Date(`${ev.eventDate}T09:00:00+05:30`) : null;
  const roundTimes = new Map<string, Date>();
  let cursor = start ? start.getTime() : 0;
  for (const m of [...planned].sort((a, b) => a.round - b.round || divKey(a.division).localeCompare(divKey(b.division)))) {
    const k = `${m.round}:${divKey(m.division)}`;
    if (!roundTimes.has(k) && start) {
      roundTimes.set(k, new Date(cursor));
      cursor += slotMinutes * 60_000;
    }
  }

  await prisma.match.deleteMany({ where: { eventId } });
  const ids = new Map<string, string>();
  // Create later rounds first so each match can point at the one its winner moves to.
  for (const m of [...planned].sort((a, b) => b.round - a.round)) {
    const created = await prisma.match.create({
      data: {
        eventId, division: m.division, round: m.round, roundLabel: m.roundLabel, slot: m.slot, bye: !!m.bye,
        ...sideData(m.home, "home"), ...sideData(m.away, "away"),
        scheduledAt: roundTimes.get(`${m.round}:${divKey(m.division)}`) ?? null, venue: ev.venue,
        nextMatchId: m.nextKey ? ids.get(m.nextKey) ?? null : null, nextSide: m.nextSide ?? null,
      },
    });
    ids.set(m.key, created.id);
  }
  // Byes: the present side goes straight through.
  for (const m of await prisma.match.findMany({ where: { eventId, bye: true } })) {
    const winner = m.homeTeamId || m.homeStudentId ? "HOME" : "AWAY";
    await prisma.match.update({ where: { id: m.id }, data: { status: "WALKOVER", winner } });
    await advance(m.id);
  }
  await prisma.event.update({ where: { id: eventId }, data: { resultsFinal: false } });
  await prisma.placing.deleteMany({ where: { eventId } });
  await audit({ actor, action: "FIXTURES_GENERATED", entityType: "Event", entityId: eventId, summary: `Fixtures generated for ${ev.name}: ${planned.filter((m) => !m.bye).length} matches (${ev.format?.toLowerCase()})`, ip });
  return planned.filter((m) => !m.bye).length;
}

/** Knockout: put the winner of a finished match into the next one. */
async function advance(matchId: string) {
  const m = await prisma.match.findUnique({ where: { id: matchId } });
  if (!m?.nextMatchId || !m.nextSide || (m.winner !== "HOME" && m.winner !== "AWAY")) return;
  const teamId = m.winner === "HOME" ? m.homeTeamId : m.awayTeamId;
  const studentId = m.winner === "HOME" ? m.homeStudentId : m.awayStudentId;
  await prisma.match.update({ where: { id: m.nextMatchId }, data: m.nextSide === "HOME" ? { homeTeamId: teamId, homeStudentId: studentId } : { awayTeamId: teamId, awayStudentId: studentId } });
}

export type ResultInput = { homeScore: number; awayScore: number; homeTiebreak?: number | null; awayTiebreak?: number | null; walkover?: "HOME" | "AWAY" | null };

/** Final score of a match. Knockout ties need a tiebreak (penalties / super over) when the format allows one. */
export type ResultGuard = {
  /** Admin edits: the match version (updatedAt) the editor was looking at. Refused if someone changed it since. */
  expectVersion?: string;
  /** Live scorer finishing a match: refused if it's already finished (e.g. by a second phone). */
  onlyIfOpen?: boolean;
};

export async function recordResult(matchId: string, input: ResultInput, actor: Actor & { type: "STAFF" }, ip: string | null, guard: ResultGuard = {}) {
  const m = await prisma.match.findUnique({ where: { id: matchId }, include: { event: true } });
  if (!m) throw new ApiError(404, "Match not found");
  if (guard.onlyIfOpen && (m.status === "COMPLETED" || m.status === "WALKOVER")) {
    throw new ApiError(409, `This match was already finished${m.scoredByName ? ` by ${m.scoredByName}` : ""}. Refresh to see the result.`);
  }
  if (guard.expectVersion && m.updatedAt.toISOString() !== guard.expectVersion) {
    throw new ApiError(409, `This match was changed${m.scoredByName ? ` by ${m.scoredByName}` : " by someone else"} while you were editing. Refresh and check it before saving.`);
  }
  if (m.bye) throw new ApiError(409, "This is a bye.");
  if (m.status === "CANCELLED") throw new ApiError(409, "This match is cancelled. Reinstate it before entering a result.");
  if (m.status === "POSTPONED") throw new ApiError(409, "This match is postponed. Reschedule it before entering a result.");
  if (!(m.homeTeamId || m.homeStudentId) || !(m.awayTeamId || m.awayStudentId)) throw new ApiError(409, "Both sides aren't known yet — finish the earlier round first.");
  if (m.event.resultsFinal) throw new ApiError(409, "Results for this event are final. Reopen them before changing a score.");
  if (m.nextMatchId) {
    const next = await prisma.match.findUnique({ where: { id: m.nextMatchId } });
    if (next && next.status !== "SCHEDULED") throw new ApiError(409, "The next round has already started, so this result can't change.");
  }
  let winner: "HOME" | "AWAY" | "DRAW";
  if (input.walkover) winner = input.walkover;
  else if (input.homeScore !== input.awayScore) winner = input.homeScore > input.awayScore ? "HOME" : "AWAY";
  else if (m.event.format === "KNOCKOUT") {
    if (input.homeTiebreak == null || input.awayTiebreak == null || input.homeTiebreak === input.awayTiebreak) {
      throw new ApiError(400, m.event.shootout ? "It's a draw — enter the shoot-out score to decide the winner." : "Knockout matches need a winner. Turn on shoot-outs in the format, or correct the score.", { homeTiebreak: "Needed to break the tie" });
    }
    winner = input.homeTiebreak > input.awayTiebreak ? "HOME" : "AWAY";
  } else winner = "DRAW";

  await prisma.match.update({
    where: { id: matchId },
    data: {
      homeScore: input.walkover ? null : input.homeScore, awayScore: input.walkover ? null : input.awayScore,
      homeTiebreak: winner !== "DRAW" && input.homeScore === input.awayScore ? input.homeTiebreak ?? null : null,
      awayTiebreak: winner !== "DRAW" && input.homeScore === input.awayScore ? input.awayTiebreak ?? null : null,
      status: input.walkover ? "WALKOVER" : "COMPLETED", winner, scoredByName: actor.name,
    },
  });
  await advance(matchId);
  await audit({ actor, action: "MATCH_SCORED", entityType: "Match", entityId: matchId, summary: `${m.event.name} ${m.roundLabel}: ${input.walkover ? `walkover to ${input.walkover.toLowerCase()}` : `${input.homeScore}–${input.awayScore}`}${input.homeTiebreak != null && input.homeScore === input.awayScore ? ` (${input.homeTiebreak}–${input.awayTiebreak} tiebreak)` : ""}`, ip });
}

/**
 * Live scoring taps from a phone. Each tap carries a clientId generated on the device, so taps queued
 * while offline can be replayed safely: duplicates are ignored, and the score is rebuilt from all taps.
 */
export async function applyLiveTaps(matchId: string, taps: Array<{ clientId: string; side: "HOME" | "AWAY"; delta: 1 | -1; at: string }>, actor: Actor & { type: "STAFF" }) {
  const m = await prisma.match.findUnique({ where: { id: matchId }, include: { event: true } });
  if (!m) throw new ApiError(404, "Match not found");
  if (m.status === "COMPLETED" || m.status === "WALKOVER") throw new ApiError(409, "This match is already finished.");
  if (m.status === "POSTPONED" || m.status === "CANCELLED") throw new ApiError(409, `This match is ${m.status.toLowerCase()}. It can't be scored until the organiser reschedules it.`);
  if (!(m.homeTeamId || m.homeStudentId) || !(m.awayTeamId || m.awayStudentId)) throw new ApiError(409, "Both sides aren't known yet.");
  for (const t of taps) {
    const at = new Date(t.at);
    try {
      // The unique clientId makes this atomic: a tap retried at the same moment by two requests is stored once,
      // and the second insert is simply skipped (no separate "does it exist?" check that two requests could race).
      await prisma.scoreEvent.create({ data: { matchId, clientId: t.clientId, side: t.side, delta: t.delta, byId: actor.id, byName: actor.name, at: Number.isNaN(at.getTime()) ? new Date() : at } });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") continue; // already stored
      throw e;
    }
  }
  const all = await prisma.scoreEvent.findMany({ where: { matchId }, orderBy: { at: "asc" } });
  let home = 0, away = 0;
  for (const e of all) {
    if (e.side === "HOME") home = Math.max(0, home + e.delta);
    else away = Math.max(0, away + e.delta);
  }
  await prisma.match.update({ where: { id: matchId }, data: { homeScore: home, awayScore: away, status: "LIVE", scoredByName: actor.name } });
  return { homeScore: home, awayScore: away, taps: all.length };
}

export type StandingRow = { key: string; name: string; institution: string; teamId: string | null; studentId: string | null; p: number; w: number; d: number; l: number; f: number; a: number; pts: number };

type MatchWithSides = Awaited<ReturnType<typeof matchesFor>>[number];
export async function matchesFor(eventId: string) {
  return prisma.match.findMany({
    where: { eventId },
    orderBy: [{ division: "asc" }, { round: "asc" }, { slot: "asc" }],
    include: {
      court: { include: { venue: true } },
      homeTeam: { include: { school: true } }, awayTeam: { include: { school: true } },
      homeStudent: { select: { id: true, fullName: true, universityName: true, school: { select: { name: true } } } },
      awayStudent: { select: { id: true, fullName: true, universityName: true, school: { select: { name: true } } } },
    },
  });
}

/** Only the side fields are read, so callers needn't load anything else (e.g. the court). */
export function sideOf(m: Pick<MatchWithSides, "homeTeam" | "awayTeam" | "homeStudent" | "awayStudent">, side: "HOME" | "AWAY") {
  const team = side === "HOME" ? m.homeTeam : m.awayTeam;
  const st = side === "HOME" ? m.homeStudent : m.awayStudent;
  if (team) return { key: `t:${team.id}`, name: team.name, short: team.shortName, institution: teamInstitution(team), teamId: team.id, studentId: null };
  if (st) return { key: `s:${st.id}`, name: st.fullName ?? "—", short: (st.fullName ?? "—").split(" ")[0], institution: institutionOf(st), teamId: null, studentId: st.id };
  return null;
}

/** League table for one division. Sorted by points, goal/point difference, scored, then name. */
export function standings(matches: MatchWithSides[], pointsWin: number, pointsDraw: number): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  const row = (s: NonNullable<ReturnType<typeof sideOf>>) => {
    if (!rows.has(s.key)) rows.set(s.key, { key: s.key, name: s.name, institution: s.institution, teamId: s.teamId, studentId: s.studentId, p: 0, w: 0, d: 0, l: 0, f: 0, a: 0, pts: 0 });
    return rows.get(s.key) as StandingRow;
  };
  for (const m of matches) {
    const h = sideOf(m, "HOME"), a = sideOf(m, "AWAY");
    if (!h || !a) continue;
    const H = row(h), A = row(a);
    if (m.status !== "COMPLETED" && m.status !== "WALKOVER") continue;
    H.p++; A.p++;
    H.f += m.homeScore ?? 0; H.a += m.awayScore ?? 0; A.f += m.awayScore ?? 0; A.a += m.homeScore ?? 0;
    if (m.winner === "HOME") { H.w++; A.l++; H.pts += pointsWin; }
    else if (m.winner === "AWAY") { A.w++; H.l++; A.pts += pointsWin; }
    else { H.d++; A.d++; H.pts += pointsDraw; A.pts += pointsDraw; }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || y.f - y.a - (x.f - x.a) || y.f - x.f || x.name.localeCompare(y.name));
}

export type PlacingInput = { division: string | null; position: number; teamId: string | null; studentId: string | null; mark?: string | null };

/** Podium the results imply: league table order, or the knockout final + losing semi-finalists (joint bronze). */
export async function suggestPlacings(eventId: string): Promise<{ placings: PlacingInput[]; unfinished: number }> {
  const ev = await loadEvent(eventId);
  const matches = await matchesFor(eventId);
  const unfinished = matches.filter((m) => !m.bye && m.status !== "COMPLETED" && m.status !== "WALKOVER").length;
  const divisions = [...new Set(matches.map((m) => m.division ?? null))];
  const out: PlacingInput[] = [];
  for (const d of divisions) {
    const ms = matches.filter((m) => (m.division ?? null) === d);
    if (ev.format === "LEAGUE") {
      standings(ms, ev.pointsWin, ev.pointsDraw).slice(0, 3).forEach((r, i) => out.push({ division: d, position: i + 1, teamId: r.teamId, studentId: r.studentId }));
    } else if (ev.format === "KNOCKOUT") {
      const top = Math.max(...ms.map((m) => m.round));
      const final = ms.find((m) => m.round === top);
      if (final?.winner === "HOME" || final?.winner === "AWAY") {
        const w = sideOf(final, final.winner), l = sideOf(final, final.winner === "HOME" ? "AWAY" : "HOME");
        if (w) out.push({ division: d, position: 1, teamId: w.teamId, studentId: w.studentId });
        if (l) out.push({ division: d, position: 2, teamId: l.teamId, studentId: l.studentId });
      }
      for (const semi of ms.filter((m) => m.round === top - 1 && !m.bye && (m.winner === "HOME" || m.winner === "AWAY"))) {
        const loser = sideOf(semi, semi.winner === "HOME" ? "AWAY" : "HOME");
        if (loser) out.push({ division: d, position: 3, teamId: loser.teamId, studentId: loser.studentId });
      }
    }
  }
  return { placings: out, unfinished };
}

/** Confirms the final positions. Medals and medal certificates come from these. */
export async function finaliseResults(eventId: string, placings: PlacingInput[], actor: Actor, ip: string | null) {
  const ev = await loadEvent(eventId);
  if (!placings.length) throw new ApiError(400, "Enter at least the winner.");
  const allowed = new Set((await entrantsFor(eventId)).map((e) => e.teamId ?? e.studentId));
  for (const p of placings) {
    if (!allowed.has(p.teamId ?? p.studentId)) throw new ApiError(400, "Only teams and approved athletes in this event can be placed.");
    if (p.position < 1 || p.position > 50) throw new ApiError(400, "Positions run from 1 to 50.");
  }
  await prisma.$transaction([
    prisma.placing.deleteMany({ where: { eventId } }),
    prisma.placing.createMany({ data: placings.map((p) => ({ eventId, division: p.division, position: p.position, teamId: p.teamId, studentId: p.studentId, mark: p.mark?.trim() || null })) }),
    prisma.event.update({ where: { id: eventId }, data: { resultsFinal: true } }),
  ]);
  await audit({ actor, action: "RESULTS_FINALISED", entityType: "Event", entityId: eventId, summary: `Results finalised for ${ev.sport.name} · ${ev.name} (${placings.length} placings)`, ip });
}

export async function reopenResults(eventId: string, actor: Actor, ip: string | null) {
  const ev = await loadEvent(eventId);
  if (await prisma.certificate.count({ where: { eventId, kind: { not: "PARTICIPATION" }, revokedAt: null } })) {
    throw new ApiError(409, "Medal certificates have been issued for this event. Revoke them before reopening results.");
  }
  await prisma.event.update({ where: { id: eventId }, data: { resultsFinal: false } });
  await audit({ actor, action: "RESULTS_FINALISED", entityType: "Event", entityId: eventId, summary: `Results reopened for ${ev.name}`, ip });
}

export type TallyRow = { institution: string; gold: number; silver: number; bronze: number; total: number };

/** Medals by institution across every finalised event. Team medals count once per team, not per player. */
export async function medalTally(): Promise<TallyRow[]> {
  const placings = await prisma.placing.findMany({
    where: { position: { lte: 3 }, event: { resultsFinal: true } },
    include: { team: { include: { school: true } }, student: { select: { universityName: true, school: { select: { name: true } } } } },
  });
  const rows = new Map<string, TallyRow>();
  for (const p of placings) {
    const inst = p.team ? teamInstitution(p.team) : p.student ? institutionOf(p.student) : "—";
    const r = rows.get(inst) ?? { institution: inst, gold: 0, silver: 0, bronze: 0, total: 0 };
    if (p.position === 1) r.gold++;
    else if (p.position === 2) r.silver++;
    else r.bronze++;
    r.total++;
    rows.set(inst, r);
  }
  return [...rows.values()].sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.institution.localeCompare(b.institution));
}

export function isFormat(v: string | null | undefined): v is Format {
  return v === "LEAGUE" || v === "KNOCKOUT" || v === "RACE";
}
