import { z } from "zod";
import { route, parseJson, ok, clientIp } from "@/lib/api";
import { requireStaffApi, staffActor } from "@/lib/rbac";
import { addCourt, createVenue, setCourtActive } from "@/lib/match-management";

const name = z.string().trim().min(2, "Enter a name").max(80, "Too long");
const schema = z.union([
  z.object({ op: z.literal("venue-create"), name, address: z.string().trim().max(200).nullable() }),
  z.object({ op: z.literal("court-add"), venueId: z.string().min(1), name }),
  z.object({ op: z.literal("court-active"), courtId: z.string().min(1), active: z.boolean() }),
]);

/** Venues and courts (admins). Courts are where matches are scheduled. */
export const POST = route(async (req) => {
  const staff = await requireStaffApi(["ADMIN"]);
  const actor = staffActor(staff);
  const ip = clientIp(req);
  const input = await parseJson(req, schema);
  switch (input.op) {
    case "venue-create":
      return ok({ id: (await createVenue(input.name, input.address, actor, ip)).id }, { status: 201 });
    case "court-add":
      return ok({ id: (await addCourt(input.venueId, input.name, actor, ip)).id }, { status: 201 });
    case "court-active":
      await setCourtActive(input.courtId, input.active, actor, ip);
      break;
  }
  return ok({ ok: true });
});
