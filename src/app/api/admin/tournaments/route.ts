import { z } from "zod";
import { route, parseJson, ok, clientIp, ApiError } from "@/lib/api";
import { requireStaffApi, staffActor } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { TOURNAMENT_STATUSES, createTournament, deleteTournament, updateTournament } from "@/lib/tournaments";

const dateOrNull = z.union([z.literal(""), z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")]).transform((v) => v || null);
const dateTimeOrNull = z.union([z.literal(""), z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a valid date and time")]).transform((v) => v || null);
const fields = {
  name: z.string().trim().min(3, "Enter a name").max(80, "Too long"),
  season: z.string().trim().regex(/^\d{4}-\d{2}$/, "Use the form 2027-28"),
  startDate: dateOrNull,
  endDate: dateOrNull,
  registrationOpensAt: dateTimeOrNull,
  registrationClosesAt: dateTimeOrNull,
  status: z.enum(TOURNAMENT_STATUSES),
};
const schema = z.union([
  z.object({ op: z.literal("create"), ...fields }),
  z.object({ op: z.literal("update"), id: z.string().min(1), ...fields }),
  z.object({ op: z.literal("delete"), id: z.string().min(1) }),
  z.object({ op: z.literal("assign"), eventId: z.string().min(1), tournamentId: z.string().min(1) }),
]);

/** Tournaments: create, edit, delete (only when empty), and move events between them. Admins and super admins. */
export const POST = route(async (req) => {
  const staff = await requireStaffApi(["ADMIN"]);
  const actor = staffActor(staff);
  const ip = clientIp(req);
  const input = await parseJson(req, schema);
  switch (input.op) {
    case "create": {
      const { op: _op, ...data } = input;
      const t = await createTournament(data, actor, ip);
      return ok({ id: t.id }, { status: 201 });
    }
    case "update": {
      const { op: _op, id, ...data } = input;
      await updateTournament(id, data, actor, ip);
      break;
    }
    case "delete":
      await deleteTournament(input.id, actor, ip);
      break;
    case "assign": {
      const [ev, t] = await Promise.all([
        prisma.event.findUnique({ where: { id: input.eventId }, include: { sport: true, tournament: true } }),
        prisma.tournament.findUnique({ where: { id: input.tournamentId } }),
      ]);
      if (!ev || !t) throw new ApiError(404, "Event or tournament not found");
      if (ev.tournamentId === t.id) break;
      await prisma.event.update({ where: { id: ev.id }, data: { tournamentId: t.id } });
      await audit({ actor, action: "TOURNAMENT_CHANGED", entityType: "Event", entityId: ev.id, summary: `${ev.sport.name} · ${ev.name} moved from ${ev.tournament?.name ?? "no tournament"} to ${t.name}`, ip });
      break;
    }
  }
  return ok({ ok: true });
});
