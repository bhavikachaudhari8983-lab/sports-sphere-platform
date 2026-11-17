import { z } from "zod";
import { route, ok, parseJson, clientIp, ApiError } from "@/lib/api";
import { requireStaffApi, staffActor } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { FORMATS } from "@/lib/constants";
import { finaliseResults, generateFixtures, recordResult, reopenResults } from "@/lib/competition";
import { addMember, createTeam, deleteTeam, removeMember, setCaptain, setLocked } from "@/lib/teams";
import { issueForEvent } from "@/lib/certificates";
import { MATCH_DUTIES, scheduleMatch, setMatchStatus, setOfficial } from "@/lib/match-management";
import { parseIstLocal } from "@/lib/tournaments";

const n = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const score = n(0, 999);
const schema = z.union([
  z.object({
    op: z.literal("format"),
    format: z.enum(FORMATS),
    periods: n(1, 10).nullable(),
    periodMinutes: n(1, 240).nullable(),
    shootout: z.boolean(),
    pointsWin: n(0, 10),
    pointsDraw: n(0, 10),
    rosterMin: n(1, 50).nullable(),
    rosterMax: n(1, 60).nullable(),
  }).refine((v) => v.rosterMin == null || v.rosterMax == null || v.rosterMin <= v.rosterMax, { message: "Must be at least the minimum", path: ["rosterMax"] }),
  z.object({ op: z.literal("team-create"), name: z.string().trim().min(2, "Too short").max(60), shortName: z.string().trim().min(2, "2–5 letters").max(5, "2–5 letters"), schoolId: z.string().nullable(), collegeName: z.string().trim().max(120).nullable() }),
  z.object({ op: z.literal("team-delete"), teamId: z.string() }),
  z.object({ op: z.literal("member-add"), teamId: z.string(), studentId: z.string().min(1, "Choose a player") }),
  z.object({ op: z.literal("member-remove"), teamId: z.string(), studentId: z.string() }),
  z.object({ op: z.literal("captain"), teamId: z.string(), studentId: z.string() }),
  z.object({ op: z.literal("lock"), teamId: z.string(), locked: z.boolean() }),
  z.object({ op: z.literal("generate") }),
  z.object({ op: z.literal("result"), matchId: z.string(), version: z.string().min(10, "Refresh the page and try again"), homeScore: score, awayScore: score, homeTiebreak: score.nullable().optional(), awayTiebreak: score.nullable().optional(), walkover: z.enum(["HOME", "AWAY"]).nullable().optional() }),
  z.object({
    op: z.literal("finalise"),
    placings: z.array(z.object({ division: z.string().nullable(), position: n(1, 50), teamId: z.string().nullable(), studentId: z.string().nullable(), mark: z.string().trim().max(30).nullable().optional() })).min(1, "Enter at least the winner").max(200),
  }),
  z.object({ op: z.literal("reopen") }),
  z.object({ op: z.literal("certificates") }),
  z.object({
    op: z.literal("schedule"),
    matchId: z.string().min(1),
    version: z.string().min(10, "Refresh the page and try again"),
    scheduledAt: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a date and time")]),
    courtId: z.string(),
    durationMin: z.union([z.literal(""), n(5, 600)]),
  }),
  z.object({ op: z.literal("match-status"), matchId: z.string().min(1), to: z.enum(["POSTPONED", "CANCELLED", "SCHEDULED"]), reason: z.string().trim().max(300) }),
  z.object({ op: z.literal("official"), matchId: z.string().min(1), duty: z.enum(MATCH_DUTIES), staffId: z.string().nullable() }),
]);

/** Every match action must target a match of the event in the URL. */
async function assertMatchInEvent(matchId: string, eventId: string) {
  const m = await prisma.match.findUnique({ where: { id: matchId }, select: { eventId: true } });
  if (!m || m.eventId !== eventId) throw new ApiError(404, "Match not found in this event");
}

export const POST = route<{ params: Promise<{ eventId: string }> }>(async (req, { params }) => {
  const { eventId } = await params;
  const staff = await requireStaffApi(["ADMIN"]);
  const actor = { ...staffActor(staff), type: "STAFF" as const, id: staff.id, name: staff.name, role: staff.role };
  const ip = clientIp(req);
  const input = await parseJson(req, schema);
  switch (input.op) {
    case "format": {
      const ev = await prisma.event.findUnique({ where: { id: eventId }, include: { sport: true } });
      if (!ev) throw new ApiError(404, "Event not found");
      if (ev.format && ev.format !== input.format && (await prisma.match.count({ where: { eventId, status: { in: ["LIVE", "COMPLETED"] }, bye: false } }))) {
        throw new ApiError(409, "Matches have been played, so the format can't change.");
      }
      const { op: _op, ...data } = input;
      await prisma.event.update({ where: { id: eventId }, data });
      await audit({ actor, action: "COMPETITION_CHANGED", entityType: "Event", entityId: eventId, summary: `Format for ${ev.name}: ${input.format.toLowerCase()}${input.periods ? `, ${input.periods} × ${input.periodMinutes} min` : ""}${input.shootout ? ", shoot-out on" : ""}`, ip });
      break;
    }
    case "team-create":
      return ok({ team: await createTeam({ eventId, name: input.name, shortName: input.shortName, schoolId: input.schoolId, collegeName: input.collegeName }, actor, ip) });
    case "team-delete":
      await deleteTeam(input.teamId, actor, ip);
      break;
    case "member-add":
      await addMember(input.teamId, input.studentId, actor, ip);
      break;
    case "member-remove":
      await removeMember(input.teamId, input.studentId, actor, ip);
      break;
    case "captain":
      await setCaptain(input.teamId, input.studentId, actor, ip);
      break;
    case "lock":
      await setLocked(input.teamId, input.locked, actor, ip);
      break;
    case "generate":
      return ok({ matches: await generateFixtures(eventId, actor, ip) });
    case "result":
      await assertMatchInEvent(input.matchId, eventId);
      await recordResult(input.matchId, input, actor, ip, { expectVersion: input.version });
      break;
    case "schedule":
      await assertMatchInEvent(input.matchId, eventId);
      await scheduleMatch(input.matchId, { scheduledAt: parseIstLocal(input.scheduledAt || null), courtId: input.courtId || null, durationMin: input.durationMin === "" ? null : input.durationMin, version: input.version }, actor, ip);
      break;
    case "match-status":
      await assertMatchInEvent(input.matchId, eventId);
      await setMatchStatus(input.matchId, input.to, input.reason, actor, ip);
      break;
    case "official":
      await assertMatchInEvent(input.matchId, eventId);
      await setOfficial(input.matchId, input.duty, input.staffId, actor, ip);
      break;
    case "finalise":
      await finaliseResults(eventId, input.placings, actor, ip);
      break;
    case "reopen":
      await reopenResults(eventId, actor, ip);
      break;
    case "certificates":
      return ok({ issued: await issueForEvent(eventId, actor, ip) });
  }
  return ok({ ok: true });
});
