import { z } from "zod";
import { route, ok, parseJson, clientIp, ApiError } from "@/lib/api";
import { requireStaffApi, staffActor } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { markVerified } from "@/lib/workflow";
import { confirmIdentityDocument } from "@/lib/registration";

const schema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("measurement"),
    heightCm: z.coerce.number({ error: "Enter height in cm" }).min(100, "Height must be 100–250 cm").max(250, "Height must be 100–250 cm"),
    weightKg: z.coerce.number({ error: "Enter weight in kg" }).min(25, "Weight must be 25–250 kg").max(250, "Weight must be 25–250 kg"),
  }),
  z.object({ op: z.literal("passport"), verified: z.literal(true) }),
  z.object({ op: z.literal("id-doc"), verified: z.literal(true) }),
  z.object({ op: z.literal("verify") }),
  z.object({
    op: z.literal("weigh-in"),
    eventId: z.string().min(1),
    weightKg: z.coerce.number({ error: "Enter weight in kg" }).min(25, "Weight must be 25–250 kg").max(250, "Weight must be 25–250 kg"),
    notes: z.string().trim().max(200).optional(),
  }),
]);

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Desk operations. Height & weight can ONLY be entered here, by an official or admin. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const staff = await requireStaffApi(["OFFICIAL", "ADMIN"]);
  const actor = staffActor(staff);
  const ip = clientIp(req);
  const input = await parseJson(req, schema);
  const s = await prisma.student.findUnique({ where: { id }, include: { registrations: { include: { event: { include: { sport: true } }, weightCategory: true } } } });
  if (!s) throw new ApiError(404, "Student not found");
  if (s.status === "DRAFT") throw new ApiError(409, "This registration hasn't been submitted yet.");

  switch (input.op) {
    case "measurement": {
      if (s.status === "REJECTED") throw new ApiError(409, "Registration is rejected.");
      const h = round1(input.heightCm), w = round1(input.weightKg);
      await prisma.measurement.create({ data: { studentId: id, heightCm: h, weightKg: w, measuredById: staff.id } });
      await audit({ actor, action: "MEASUREMENT_RECORDED", studentId: id, summary: `Height ${h} cm, weight ${w} kg recorded`, ip });
      break;
    }
    case "passport": {
      if (s.studentType !== "INTERNATIONAL") throw new ApiError(400, "Only international students need a passport check.");
      await prisma.student.update({ where: { id }, data: { passportDeskVerified: true, passportDeskVerifiedAt: new Date(), passportDeskVerifiedBy: staff.id } });
      await audit({ actor, action: "PASSPORT_VERIFIED", studentId: id, summary: `Passport chip/MRZ verified at desk (${s.nationality} ${s.passportNumber})`, ip });
      break;
    }
    case "id-doc":
      if (s.status === "REJECTED") throw new ApiError(409, "Registration is rejected.");
      await confirmIdentityDocument(id, { type: "STAFF", id: staff.id, name: staff.name, role: staff.role }, ip);
      break;
    case "verify":
      await markVerified(id, { type: "STAFF", id: staff.id, name: staff.name, role: staff.role }, ip);
      break;
    case "weigh-in": {
      const reg = s.registrations.find((r) => r.eventId === input.eventId);
      if (!reg) throw new ApiError(400, "The athlete isn't entered in this event.");
      if (!reg.event.sport.isWeightCategory) throw new ApiError(400, "This event has no weight categories.");
      if (s.status !== "APPROVED" && s.status !== "VERIFIED") throw new ApiError(409, "Weigh-ins are for verified or approved athletes only.");
      const w = round1(input.weightKg);
      const wc = reg.weightCategory;
      const within = wc ? (wc.minKg === null || w > wc.minKg) && (wc.maxKg === null || w <= wc.maxKg) : null;
      await prisma.weighIn.create({ data: { studentId: id, eventId: reg.eventId, weightKg: w, withinCategory: within, categoryName: wc?.name ?? null, notes: input.notes || null, recordedById: staff.id } });
      await audit({ actor, action: "WEIGH_IN_RECORDED", studentId: id, summary: `Weigh-in ${w} kg for ${reg.event.sport.name} ${reg.event.name}${wc ? ` (${wc.name}): ${within ? "within category" : "OUTSIDE category"}` : ""}`, ip });
      return ok({ withinCategory: within, category: wc?.name ?? null });
    }
  }
  return ok({ ok: true });
});
