// Match management: venues & courts, scheduling with clash checks, postpone / cancel / reinstate, and match officials.
import { prisma } from "./prisma";
import { ApiError } from "./api";
import { audit, type Actor } from "./audit";
import { formatIst } from "./tournaments";
import type { StaffSession } from "./rbac";

export const MATCH_DUTIES = ["SCOREKEEPER", "REFEREE"] as const;
export type MatchDuty = (typeof MATCH_DUTIES)[number];
export const DUTY_LABEL: Record<MatchDuty, string> = { SCOREKEEPER: "Scorer", REFEREE: "Referee" };

/** Matches that occupy their time slot (finished, postponed and cancelled ones don't block a court or a team). */
const ACTIVE_STATUSES = ["SCHEDULED", "LIVE"];
const DEFAULT_MINUTES = 45;

/** Planned length in minutes: set per match, else from the event format (periods × minutes + 20 changeover), else 45. */
export function plannedMinutes(m: { durationMin: number | null; event: { periods: number | null; periodMinutes: number | null } }): number {
  if (m.durationMin) return m.durationMin;
  if (m.event.periods && m.event.periodMinutes) return m.event.periods * m.event.periodMinutes + 20;
  return DEFAULT_MINUTES;
}

// ---------- venues & courts ----------
const cleanName = (s: string) => s.trim().replace(/\s+/g, " ");

export async function createVenue(name: string, address: string | null, actor: Actor, ip: string | null) {
  const n = cleanName(name);
  if (await prisma.venue.findUnique({ where: { name: n } })) throw new ApiError(409, "A venue with this name already exists.", { name: "Already exists" });
  const v = await prisma.venue.create({ data: { name: n, address: address?.trim() || null } });
  await audit({ actor, action: "COMPETITION_CHANGED", entityType: "Venue", entityId: v.id, summary: `Venue added: ${n}`, ip });
  return v;
}

export async function addCourt(venueId: string, name: string, actor: Actor, ip: string | null) {
  const v = await prisma.venue.findUnique({ where: { id: venueId } });
  if (!v) throw new ApiError(404, "Venue not found");
  const n = cleanName(name);
  if (await prisma.court.findUnique({ where: { venueId_name: { venueId, name: n } } })) throw new ApiError(409, "This venue already has a court with that name.", { name: "Already exists" });
  const c = await prisma.court.create({ data: { venueId, name: n } });
  await audit({ actor, action: "COMPETITION_CHANGED", entityType: "Court", entityId: c.id, summary: `Court added: ${v.name} · ${n}`, ip });
  return c;
}

export async function setCourtActive(courtId: string, active: boolean, actor: Actor, ip: string | null) {
  const c = await prisma.court.update({ where: { id: courtId }, data: { active }, include: { venue: true } });
  await audit({ actor, action: "COMPETITION_CHANGED", entityType: "Court", entityId: c.id, summary: `Court ${c.venue.name} · ${c.name} ${active ? "re-opened" : "closed"}`, ip });
}

// ---------- clash checks ----------
export type Clash = { kind: "COURT" | "ENTRANT" | "OFFICIAL"; matchId: string; message: string };

const matchInclude = {
  event: { select: { name: true, periods: true, periodMinutes: true, sport: { select: { name: true } } } },
  court: { include: { venue: true } },
  homeTeam: { select: { name: true, members: { select: { studentId: true } } } },
  awayTeam: { select: { name: true, members: { select: { studentId: true } } } },
  homeStudent: { select: { id: true, fullName: true } },
  awayStudent: { select: { id: true, fullName: true } },
  officials: { select: { staffId: true, staff: { select: { name: true } } } },
} as const;

type FullMatch = NonNullable<Awaited<ReturnType<typeof loadMatch>>>;
function loadMatch(id: string) {
  return prisma.match.findUnique({ where: { id }, include: matchInclude });
}

/** Every athlete taking part in a match: individual athletes and every member of each team. */
function athletesOf(m: Pick<FullMatch, "homeTeam" | "awayTeam" | "homeStudent" | "awayStudent">): Set<string> {
  const ids = new Set<string>();
  if (m.homeStudent) ids.add(m.homeStudent.id);
  if (m.awayStudent) ids.add(m.awayStudent.id);
  for (const t of [m.homeTeam, m.awayTeam]) for (const mem of t?.members ?? []) ids.add(mem.studentId);
  return ids;
}

const label = (m: Pick<FullMatch, "event" | "roundLabel">) => `${m.event.sport.name} · ${m.event.name} (${m.roundLabel})`;

/**
 * What would clash if this match were played from `start` for `minutes` on `courtId`:
 * the same court, any of the same athletes (also across events), or any of its officials, at an overlapping time.
 */
export async function findClashes(match: FullMatch, start: Date, minutes: number, courtId: string | null, officialIds: string[]): Promise<Clash[]> {
  const end = new Date(start.getTime() + minutes * 60_000);
  const nearby = await prisma.match.findMany({
    where: {
      id: { not: match.id },
      bye: false,
      status: { in: ACTIVE_STATUSES },
      scheduledAt: { gte: new Date(start.getTime() - 8 * 3600_000), lt: end },
    },
    include: matchInclude,
  });
  const mine = athletesOf(match);
  const myTeams = new Set([match.homeTeamId, match.awayTeamId].filter(Boolean));
  const clashes: Clash[] = [];
  for (const o of nearby) {
    if (!o.scheduledAt) continue;
    const oEnd = new Date(o.scheduledAt.getTime() + plannedMinutes(o) * 60_000);
    if (!(o.scheduledAt < end && oEnd > start)) continue; // no overlap
    const when = `${formatIst(o.scheduledAt)}`;
    if (courtId && o.courtId === courtId) clashes.push({ kind: "COURT", matchId: o.id, message: `${o.court?.name ?? "This court"} is already booked for ${label(o)} at ${when}` });
    // A team can't be in two places at once (even before its squad is filled in), nor can any athlete.
    const sharedTeam = [o.homeTeamId, o.awayTeamId].find((t) => t && myTeams.has(t));
    const shared = [...athletesOf(o)].filter((id) => mine.has(id));
    if (sharedTeam && !shared.length) clashes.push({ kind: "ENTRANT", matchId: o.id, message: `${sharedTeam === o.homeTeamId ? o.homeTeam?.name : o.awayTeam?.name} also plays ${label(o)} at ${when}` });
    if (shared.length) clashes.push({ kind: "ENTRANT", matchId: o.id, message: `${shared.length === 1 ? "An athlete" : `${shared.length} athletes`} in this match also play${shared.length === 1 ? "s" : ""} ${label(o)} at ${when}` });
    const busy = o.officials.filter((x) => officialIds.includes(x.staffId));
    for (const b of busy) clashes.push({ kind: "OFFICIAL", matchId: o.id, message: `${b.staff.name} is already officiating ${label(o)} at ${when}` });
  }
  return clashes;
}

function refuseIfLocked(m: { status: string }, what: string) {
  if (m.status === "COMPLETED" || m.status === "WALKOVER") throw new ApiError(409, `This match is finished, so its ${what} can't change.`);
}

async function refuseIfFinal(eventId: string) {
  const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { resultsFinal: true } });
  if (ev?.resultsFinal) throw new ApiError(409, "Results for this event are final. Reopen them first.");
}

// ---------- scheduling ----------
export type ScheduleInput = { scheduledAt: Date | null; courtId: string | null; durationMin: number | null; version?: string };

/** Sets a match's time, court and length. Refused (with the reasons) if anything would clash. Rescheduling a postponed match puts it back on the schedule. */
export async function scheduleMatch(matchId: string, input: ScheduleInput, actor: Actor, ip: string | null) {
  const m = await loadMatch(matchId);
  if (!m) throw new ApiError(404, "Match not found");
  refuseIfLocked(m, "schedule");
  if (m.status === "CANCELLED") throw new ApiError(409, "This match is cancelled. Reinstate it first.");
  if (m.status === "LIVE" && input.scheduledAt && m.scheduledAt && input.scheduledAt.getTime() !== m.scheduledAt.getTime()) throw new ApiError(409, "This match is being played, so its start time can't change.");
  if (input.version && m.updatedAt.toISOString() !== input.version) throw new ApiError(409, "This match was changed by someone else. Refresh and check it before saving.");
  await refuseIfFinal(m.eventId);
  if (input.courtId) {
    const c = await prisma.court.findUnique({ where: { id: input.courtId }, include: { venue: true } });
    if (!c || !c.active || !c.venue.active) throw new ApiError(400, "Choose an open court.", { courtId: "This court is closed" });
  }
  if (input.durationMin != null && (input.durationMin < 5 || input.durationMin > 600)) throw new ApiError(400, "Length must be 5–600 minutes.", { durationMin: "5–600 minutes" });

  if (input.scheduledAt) {
    const minutes = input.durationMin ?? plannedMinutes(m);
    const clashes = await findClashes(m, input.scheduledAt, minutes, input.courtId, m.officials.map((o) => o.staffId));
    if (clashes.length) {
      throw new ApiError(409, `Can't schedule at this time: ${clashes.slice(0, 3).map((c) => c.message).join("; ")}${clashes.length > 3 ? ` (+${clashes.length - 3} more)` : ""}.`, { scheduledAt: "Clashes with another match" });
    }
  }
  const rescheduled = m.status === "POSTPONED" && !!input.scheduledAt;
  await prisma.match.update({
    where: { id: m.id },
    data: { scheduledAt: input.scheduledAt, courtId: input.courtId, durationMin: input.durationMin, ...(rescheduled ? { status: "SCHEDULED", statusReason: null } : {}) },
  });
  const court = input.courtId ? await prisma.court.findUnique({ where: { id: input.courtId }, include: { venue: true } }) : null;
  await audit({
    actor, action: "COMPETITION_CHANGED", entityType: "Match", entityId: m.id,
    summary: `${label(m)} ${rescheduled ? "rescheduled" : "scheduled"}: ${input.scheduledAt ? formatIst(input.scheduledAt) : "no time"}${court ? ` · ${court.venue.name} · ${court.name}` : ""}`, ip,
  });
}

// ---------- status ----------
export type StatusChange = "POSTPONED" | "CANCELLED" | "SCHEDULED";

/** Postpone, cancel, or reinstate (back to scheduled) a match, with a reason that's shown publicly. */
export async function setMatchStatus(matchId: string, to: StatusChange, reason: string, actor: Actor, ip: string | null) {
  const m = await prisma.match.findUnique({ where: { id: matchId }, include: { event: { include: { sport: true } } } });
  if (!m) throw new ApiError(404, "Match not found");
  refuseIfLocked(m, "status");
  await refuseIfFinal(m.eventId);
  const r = reason.trim();
  if (to !== "SCHEDULED" && r.length < 3) throw new ApiError(400, "Give a reason. It's shown to teams and spectators.", { reason: "Required" });
  if (to === "POSTPONED" && !["SCHEDULED", "LIVE"].includes(m.status)) throw new ApiError(409, "Only scheduled or live matches can be postponed.");
  if (to === "CANCELLED") {
    if (!["SCHEDULED", "POSTPONED"].includes(m.status)) throw new ApiError(409, "Only scheduled or postponed matches can be cancelled.");
    if (m.event.format === "KNOCKOUT" || m.nextMatchId) throw new ApiError(409, "A knockout match can't be cancelled, because someone must go through. Record a walkover instead.");
  }
  if (to === "SCHEDULED" && !["POSTPONED", "CANCELLED"].includes(m.status)) throw new ApiError(409, "Only postponed or cancelled matches can be reinstated.");
  await prisma.match.update({ where: { id: m.id }, data: { status: to, statusReason: to === "SCHEDULED" ? null : r } });
  const what = { POSTPONED: "postponed", CANCELLED: "cancelled", SCHEDULED: "reinstated" }[to];
  await audit({ actor, action: "COMPETITION_CHANGED", entityType: "Match", entityId: m.id, summary: `${m.event.sport.name} · ${m.event.name} (${m.roundLabel}) ${what}${r ? `: ${r}` : ""}`, ip });
}

// ---------- officials ----------
/** Sets (or, with staffId null, removes) the scorer or referee of a match. One of each per match. */
export async function setOfficial(matchId: string, duty: MatchDuty, staffId: string | null, actor: Actor & { type: "STAFF" }, ip: string | null) {
  const m = await loadMatch(matchId);
  if (!m) throw new ApiError(404, "Match not found");
  refuseIfLocked(m, "officials");
  const current = await prisma.matchOfficial.findFirst({ where: { matchId, duty } });
  if (!staffId) {
    if (current) {
      await prisma.matchOfficial.delete({ where: { id: current.id } });
      await audit({ actor, action: "COMPETITION_CHANGED", entityType: "Match", entityId: m.id, summary: `${DUTY_LABEL[duty]} removed from ${label(m)}`, ip });
    }
    return;
  }
  const staff = await prisma.staffUser.findUnique({ where: { id: staffId } });
  if (!staff || !staff.active || !["OFFICIAL", "ADMIN", "SUPER_ADMIN"].includes(staff.role)) throw new ApiError(400, "Choose an active official.", { staffId: "Not an active official" });
  if (m.scheduledAt && ACTIVE_STATUSES.includes(m.status)) {
    const busy = (await findClashes(m, m.scheduledAt, plannedMinutes(m), null, [staffId])).filter((c) => c.kind === "OFFICIAL");
    if (busy.length) throw new ApiError(409, `${busy[0].message}.`, { staffId: "Busy at this time" });
  }
  await prisma.$transaction([
    ...(current ? [prisma.matchOfficial.delete({ where: { id: current.id } })] : []),
    prisma.matchOfficial.create({ data: { matchId, staffId, duty, assignedById: actor.id } }),
  ]);
  await audit({ actor, action: "COMPETITION_CHANGED", entityType: "Match", entityId: m.id, summary: `${staff.name} assigned as ${DUTY_LABEL[duty].toLowerCase()} for ${label(m)}`, ip });
}

/** May this staff member enter the live score for this match? Admins: any match. Officials: only matches they're the scorer of. */
export async function canScore(staff: Pick<StaffSession, "id" | "role">, matchId: string): Promise<boolean> {
  if (staff.role === "ADMIN" || staff.role === "SUPER_ADMIN") return true;
  if (staff.role !== "OFFICIAL") return false;
  return !!(await prisma.matchOfficial.findFirst({ where: { matchId, staffId: staff.id, duty: "SCOREKEEPER" }, select: { id: true } }));
}
