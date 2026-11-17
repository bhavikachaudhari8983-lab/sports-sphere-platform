import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ageOn } from "./age";
import { getSettings } from "./settings";
import { registrationWindowProblem } from "./tournaments";

type RegIn = { eventId?: unknown; weightCategoryId?: unknown };
export type ValidReg = { eventId: string; weightCategoryId: string | null };

/** Students who hold a place in an event: everyone submitted and not rejected. */
export const ENTRY_HOLDER: Prisma.StudentWhereInput = { status: { notIn: ["DRAFT", "REJECTED"] } };

type EventRule = { name: string; gender: string; maxEntries: number | null; ageCategory: { name: string; maxAge: number | null } | null };

/** Why an athlete can't enter an event, or null. Shared by the wizard, change requests and DOB corrections. */
export function eventIneligibility(ev: EventRule, who: { gender: string | null; dob: string | null; cutoff: string }): string | null {
  if (who.gender && ev.gender !== "MIXED" && ev.gender !== who.gender) return `${ev.name} is not open to your category`;
  const max = ev.ageCategory?.maxAge;
  if (max != null && who.dob && ageOn(who.dob, who.cutoff) >= max) return `${ev.name} is limited to ${ev.ageCategory?.name} athletes`;
  return null;
}

/** Number of places taken in each event, not counting `excludeStudentId`. */
export async function entryCounts(eventIds: string[], excludeStudentId?: string) {
  const rows = await prisma.registration.groupBy({
    by: ["eventId"],
    where: { eventId: { in: eventIds }, student: ENTRY_HOLDER, ...(excludeStudentId ? { NOT: { studentId: excludeStudentId } } : {}) },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.eventId, r._count._all]));
}

/**
 * Checks events exist, are active, match the athlete's verified gender and age, have places left,
 * aren't duplicated, and (for weight-category sports) carry a weight class of the same sport and gender.
 */
export async function validateRegistrations(
  input: unknown[],
  who: { studentId: string; gender: string | null; dob: string | null },
  /** checkWindow: false only when an admin approves a change the student asked for while registration was open. */
  opts: { requireWeight: boolean; checkWindow?: boolean },
) {
  const errors: Record<string, string> = {};
  const valid: ValidReg[] = [];
  const items = input.slice(0, 4) as RegIn[];
  if (input.length > 4) errors.registrations = "You can enter at most 4 events";

  const ids = items.map((i) => String(i.eventId ?? ""));
  const [events, settings, taken] = await Promise.all([
    prisma.event.findMany({ where: { id: { in: ids }, active: true }, include: { ageCategory: true, tournament: true, sport: { include: { weightCategories: true } } } }),
    getSettings(),
    entryCounts(ids, who.studentId),
  ]);

  items.forEach((item, idx) => {
    const ev = events.find((e) => e.id === item.eventId);
    const key = `registrations.${idx}`;
    if (!ev || !ev.sport.active) return void (errors[key] = "This event is no longer available");
    if (valid.some((v) => v.eventId === ev.id)) return;
    const closed = opts.checkWindow === false ? null : registrationWindowProblem(ev.tournament);
    if (closed) return void (errors[key] = closed);
    const why = eventIneligibility(ev, { gender: who.gender, dob: who.dob, cutoff: settings.ageCutoffDate });
    if (why) return void (errors[key] = why);
    if (ev.maxEntries != null && (taken.get(ev.id) ?? 0) >= ev.maxEntries) return void (errors[key] = `${ev.name} is full (${ev.maxEntries} entries)`);
    let weightCategoryId: string | null = null;
    if (ev.sport.isWeightCategory) {
      const wc = ev.sport.weightCategories.find((w) => w.id === item.weightCategoryId);
      if (wc && (wc.gender === who.gender || !who.gender)) weightCategoryId = wc.id;
      else if (opts.requireWeight) return void (errors[key] = `Choose a weight category for ${ev.name}`);
    }
    valid.push({ eventId: ev.id, weightCategoryId });
  });
  return { valid, errors };
}
