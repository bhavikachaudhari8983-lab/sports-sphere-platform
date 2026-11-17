import { z } from "zod";
import { route, ok, parseJson, clientIp, ApiError } from "@/lib/api";
import { canScore } from "@/lib/match-management";
import { requireStaffApi, staffActor } from "@/lib/rbac";
import { applyLiveTaps, recordResult } from "@/lib/competition";

const score = z.coerce.number().int().min(0).max(999);
const schema = z.union([
  z.object({ kind: z.literal("taps"), taps: z.array(z.object({ clientId: z.string().min(8).max(64), side: z.enum(["HOME", "AWAY"]), delta: z.union([z.literal(1), z.literal(-1)]), at: z.string().max(40) })).min(1).max(500) }),
  z.object({ kind: z.literal("final"), homeScore: score, awayScore: score, homeTiebreak: score.nullable().optional(), awayTiebreak: score.nullable().optional() }),
]);

/** Officials score from a phone at the ground. Taps may arrive late (offline queue) and out of order. */
export const POST = route<{ params: Promise<{ matchId: string }> }>(async (req, { params }) => {
  const { matchId } = await params;
  const staff = await requireStaffApi(["ADMIN", "OFFICIAL"]);
  // Officials score only the matches they are assigned to as scorer; admins can score any match.
  if (!(await canScore(staff, matchId))) throw new ApiError(403, "You aren't the scorer for this match. Ask the organiser to assign you.");
  const actor = { ...staffActor(staff), type: "STAFF" as const, id: staff.id, name: staff.name, role: staff.role };
  const input = await parseJson(req, schema);
  if (input.kind === "taps") return ok(await applyLiveTaps(matchId, input.taps, actor));
  await recordResult(matchId, input, actor, clientIp(req), { onlyIfOpen: true });
  return ok({ ok: true });
});
