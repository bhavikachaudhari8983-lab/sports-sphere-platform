import { z } from "zod";
import bcrypt from "bcryptjs";
import { route, ok, parseJson, clientIp, ApiError } from "@/lib/api";
import { requireStaffApi, staffActor } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { saveSettings, getSettings } from "@/lib/settings";
import { deleteStudentData } from "@/lib/data-deletion";
import { isoDate, email } from "@/lib/validation/common";
import { ADMIN_ROLES, EVENT_GENDERS, STAFF_ROLES, type StaffRole } from "@/lib/constants";
import { slugify } from "@/lib/utils";

const password = z.string().min(10, "At least 10 characters").max(100).regex(/[A-Z]/, "Include an uppercase letter").regex(/[a-z]/, "Include a lowercase letter").regex(/\d/, "Include a number");
const name = z.string().trim().min(2, "Too short").max(80);
const kg = z.coerce.number().positive().max(250);

const schema = z.union([
  z.object({ op: z.literal("general"), ageCutoffDate: isoDate, retentionDays: z.coerce.number().int().min(30, "At least 30 days").max(3650), meetName: name }),
  z.object({ op: z.literal("age-category"), id: z.string(), maxAge: z.coerce.number().int().min(5).max(99).nullable() }),
  z.object({ op: z.literal("sport-add"), name, isWeightCategory: z.boolean(), isTeam: z.boolean(), positions: z.string().trim().max(300).optional() }),
  z.object({ op: z.literal("sport-toggle"), id: z.string(), active: z.boolean() }),
  z.object({ op: z.literal("event-add"), sportId: z.string(), name, gender: z.enum(EVENT_GENDERS), eventDate: isoDate.optional().or(z.literal("")), venue: z.string().trim().max(80).optional() }),
  z.object({ op: z.literal("event-toggle"), id: z.string(), active: z.boolean() }),
  z.object({
    op: z.literal("event-limits"),
    id: z.string(),
    minEntries: z.coerce.number().int().min(1).max(500).nullable(),
    maxEntries: z.coerce.number().int().min(1).max(5000).nullable(),
    ageCategoryId: z.string().nullable(),
  }).refine((v) => v.minEntries == null || v.maxEntries == null || v.minEntries <= v.maxEntries, { message: "Must be at least the minimum", path: ["maxEntries"] }),
  z.object({ op: z.literal("weight-add"), sportId: z.string(), gender: z.enum(["MALE", "FEMALE"]), name: z.string().trim().min(2).max(20), minKg: kg.nullable().optional(), maxKg: kg.nullable().optional() }),
  z.object({ op: z.literal("weight-delete"), id: z.string() }),
  z.object({ op: z.literal("staff-add"), name, email, role: z.enum(STAFF_ROLES), password, sportId: z.string().optional() }),
  z.object({ op: z.literal("staff-update"), id: z.string(), active: z.boolean().optional(), password: password.optional() }),
  z.object({ op: z.literal("campus-add"), name, code: z.string().trim().min(2, "2–6 letters").max(6, "2–6 letters").regex(/^[A-Za-z0-9]+$/, "Letters and numbers only") }),
  z.object({ op: z.literal("campus-toggle"), id: z.string(), active: z.boolean() }),
  z.object({ op: z.literal("school-add"), campusId: z.string().min(1, "Choose a campus"), name, code: z.string().trim().min(2, "2–6 letters").max(6, "2–6 letters").regex(/^[A-Za-z0-9]+$/, "Letters and numbers only") }),
  z.object({ op: z.literal("school-toggle"), id: z.string(), active: z.boolean() }),
  z.object({ op: z.literal("deletion-complete"), id: z.string() }),
  z.object({ op: z.literal("deletion-decline"), id: z.string(), reason: z.string().trim().min(5, "Give a reason").max(300) }),
  z.object({ op: z.literal("retention-purge") }),
]);

export const POST = route(async (req) => {
  const staff = await requireStaffApi(["ADMIN"]);
  const actor = staffActor(staff);
  const ip = clientIp(req);
  const input = await parseJson(req, schema);
  const log = (summary: string, action: "SETTINGS_CHANGED" | "STAFF_CHANGED" = "SETTINGS_CHANGED") => audit({ actor, action, summary, ip });

  switch (input.op) {
    case "general": {
      const before = await getSettings();
      await saveSettings({ ageCutoffDate: input.ageCutoffDate, retentionDays: input.retentionDays, meetName: input.meetName });
      await log(`General settings updated (age cutoff ${before.ageCutoffDate} → ${input.ageCutoffDate}, retention ${before.retentionDays} → ${input.retentionDays} days)`);
      break;
    }
    case "age-category": {
      const c = await prisma.ageCategory.update({ where: { id: input.id }, data: { maxAge: input.maxAge } });
      await log(`Age category ${c.name} limit set to ${input.maxAge === null ? "none (open)" : `under ${input.maxAge}`}`);
      break;
    }
    case "sport-add": {
      const slug = slugify(input.name);
      if (await prisma.sport.findFirst({ where: { OR: [{ name: input.name }, { slug }] } })) throw new ApiError(409, "A sport with this name already exists.", { name: "Already exists" });
      await prisma.sport.create({ data: { name: input.name, slug, isWeightCategory: input.isWeightCategory, isTeam: input.isTeam, positions: input.positions || null } });
      await log(`Sport added: ${input.name}`);
      break;
    }
    case "sport-toggle": {
      const s = await prisma.sport.update({ where: { id: input.id }, data: { active: input.active } });
      await log(`Sport ${s.name} ${input.active ? "enabled" : "disabled"}`);
      break;
    }
    case "event-add": {
      const sport = await prisma.sport.findUnique({ where: { id: input.sportId } });
      if (!sport) throw new ApiError(404, "Sport not found");
      await prisma.event.create({ data: { sportId: sport.id, name: input.name, gender: input.gender, eventDate: input.eventDate || null, venue: input.venue || null } });
      await log(`Event added: ${sport.name} — ${input.name}`);
      break;
    }
    case "event-toggle": {
      const e = await prisma.event.update({ where: { id: input.id }, data: { active: input.active } });
      await log(`Event ${e.name} ${input.active ? "enabled" : "disabled"}`);
      break;
    }
    case "event-limits": {
      const e = await prisma.event.update({ where: { id: input.id }, data: { minEntries: input.minEntries, maxEntries: input.maxEntries, ageCategoryId: input.ageCategoryId }, include: { ageCategory: true } });
      await log(`Event ${e.name} limits: min ${input.minEntries ?? "—"}, max ${input.maxEntries ?? "—"}, age ${e.ageCategory?.name ?? "open to all"}`);
      break;
    }
    case "weight-add": {
      const sport = await prisma.sport.findUnique({ where: { id: input.sportId } });
      if (!sport?.isWeightCategory) throw new ApiError(400, "This sport doesn't use weight categories.");
      if (input.minKg && input.maxKg && input.minKg >= input.maxKg) throw new ApiError(400, "Minimum must be below maximum.", { maxKg: "Must be above the minimum" });
      await prisma.weightCategory.create({ data: { sportId: sport.id, gender: input.gender, name: input.name, minKg: input.minKg ?? null, maxKg: input.maxKg ?? null } });
      await log(`Weight category added: ${sport.name} ${input.gender.toLowerCase()} ${input.name}`);
      break;
    }
    case "weight-delete": {
      const used = await prisma.registration.count({ where: { weightCategoryId: input.id } });
      if (used) throw new ApiError(409, `${used} athlete(s) are registered in this category; it can't be deleted.`);
      const w = await prisma.weightCategory.delete({ where: { id: input.id } });
      await log(`Weight category deleted: ${w.name}`);
      break;
    }
    case "campus-add": {
      const code = input.code.toUpperCase();
      if (await prisma.campus.findFirst({ where: { OR: [{ name: input.name }, { code }] } })) throw new ApiError(409, "A campus with this name or code exists.", { code: "Already used" });
      await prisma.campus.create({ data: { name: input.name, code } });
      await log(`Campus added: ${input.name} (${code})`);
      break;
    }
    case "campus-toggle": {
      const c = await prisma.campus.update({ where: { id: input.id }, data: { active: input.active } });
      await log(`Campus ${c.name} ${input.active ? "activated" : "set to inactive"}`);
      break;
    }
    case "school-add": {
      const code = input.code.toUpperCase();
      if (await prisma.school.findUnique({ where: { code } })) throw new ApiError(409, "A school with this code exists.", { code: "Already used" });
      const s = await prisma.school.create({ data: { campusId: input.campusId, name: input.name, code }, include: { campus: true } });
      await log(`School added: ${s.name} (${code}) on ${s.campus.name}`);
      break;
    }
    case "school-toggle": {
      const s = await prisma.school.update({ where: { id: input.id }, data: { active: input.active } });
      await log(`School ${s.name} ${input.active ? "activated" : "set to inactive"}`);
      break;
    }
    case "staff-add": {
      if (ADMIN_ROLES.includes(input.role) && staff.role !== "SUPER_ADMIN") throw new ApiError(403, "Only a super admin can create admin accounts.", { role: "Only a super admin can choose this role" });
      if (await prisma.staffUser.findUnique({ where: { email: input.email } })) throw new ApiError(409, "This email already has an account.", { email: "Already in use" });
      if (input.role === "COACH" && !input.sportId) throw new ApiError(400, "Choose the coach's sport.", { sportId: "Required for coaches" });
      await prisma.staffUser.create({ data: { name: input.name, email: input.email, role: input.role, sportId: input.role === "COACH" ? input.sportId : null, passwordHash: await bcrypt.hash(input.password, 12) } });
      await log(`Staff account created: ${input.email} (${input.role})`, "STAFF_CHANGED");
      break;
    }
    case "staff-update": {
      if (input.id === staff.id && input.active === false) throw new ApiError(400, "You can't deactivate your own account.");
      const target = await prisma.staffUser.findUnique({ where: { id: input.id }, select: { role: true, active: true } });
      if (!target) throw new ApiError(404, "Staff account not found");
      // Admin accounts are managed only by a super admin, and the last active super admin can't be switched off.
      if (ADMIN_ROLES.includes(target.role as StaffRole) && staff.role !== "SUPER_ADMIN") throw new ApiError(403, "Only a super admin can change admin accounts.");
      if (target.role === "SUPER_ADMIN" && target.active && input.active === false && (await prisma.staffUser.count({ where: { role: "SUPER_ADMIN", active: true } })) <= 1) {
        throw new ApiError(409, "This is the only active super admin. Make another super admin first.");
      }
      const u = await prisma.staffUser.update({
        where: { id: input.id },
        data: { ...(input.active !== undefined ? { active: input.active } : {}), ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 12) } : {}) },
      });
      await log(`Staff ${u.email}: ${input.active !== undefined ? (input.active ? "reactivated" : "deactivated") : ""}${input.password ? " password reset" : ""}`, "STAFF_CHANGED");
      break;
    }
    case "deletion-complete": {
      const r = await prisma.deletionRequest.findUnique({ where: { id: input.id } });
      if (!r || r.status !== "PENDING") throw new ApiError(404, "Request not found or already processed.");
      if (r.studentId) await deleteStudentData(r.studentId, actor, `deletion request ${r.id}`, ip);
      await prisma.deletionRequest.update({ where: { id: r.id }, data: { status: "COMPLETED", processedById: staff.id, processedAt: new Date(), studentLabel: "[deleted student]" } });
      break;
    }
    case "deletion-decline": {
      const r = await prisma.deletionRequest.update({ where: { id: input.id }, data: { status: "DECLINED", processedById: staff.id, processedAt: new Date() } });
      if (r.studentId) await prisma.student.update({ where: { id: r.studentId }, data: { deletionRequestedAt: null } });
      await audit({ actor, action: "DELETION_DECLINED", studentId: r.studentId, summary: `Deletion request declined: ${input.reason}`, ip });
      break;
    }
    case "retention-purge": {
      const { retentionDays } = await getSettings();
      const cutoff = new Date(Date.now() - retentionDays * 86400_000);
      const stale = await prisma.student.findMany({ where: { status: { in: ["DRAFT", "REJECTED"] }, updatedAt: { lt: cutoff } }, select: { id: true } });
      for (const s of stale) await deleteStudentData(s.id, { type: "SYSTEM" }, `retention policy: inactive > ${retentionDays} days`, ip);
      const otps = await prisma.otpChallenge.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86400_000) } } });
      await audit({ actor, action: "RETENTION_PURGE", summary: `Retention purge: ${stale.length} stale draft/rejected profile(s) and ${otps.count} expired OTP record(s) deleted (older than ${retentionDays} days)`, ip });
      return ok({ purged: stale.length, otps: otps.count });
    }
  }
  return ok({ ok: true });
});
