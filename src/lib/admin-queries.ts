import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { isStatus, isStudentType } from "./constants";
import { ageCategoryFor, type AgeCategoryLike } from "./age";
import { getSettings } from "./settings";
import { ENTRY_HOLDER } from "./eligibility";
import { textMatch } from "@/lib/text-match";

export type StudentFilters = {
  q?: string;
  status?: string;
  sport?: string;
  event?: string;
  weight?: string;
  type?: string;
  college?: string;
  gender?: string;
  school?: string;
  age?: string;
  /** "ready" = verified, every check passed, no open age concern (safe to bulk-approve); "dob" / "concerns" / "changes" = waiting for a decision. */
  view?: string;
  page?: number;
};

export const FILTER_KEYS = ["q", "status", "sport", "event", "weight", "type", "college", "gender", "school", "age", "view"] as const;

export function parseFilters(sp: Record<string, string | string[] | undefined>): StudentFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : undefined) || undefined;
  const f: StudentFilters = { page: Math.max(1, Number(one("page") ?? 1) || 1) };
  for (const k of FILTER_KEYS) f[k] = one(k);
  return f;
}

/** Same-day-of-year `years` before an ISO date, as an ISO date (string comparison works on YYYY-MM-DD). */
const yearsBefore = (iso: string, years: number) => `${String(Number(iso.slice(0, 4)) - years).padStart(4, "0")}${iso.slice(4)}`;

/**
 * DOB range for an age category. Age on cutoff < maxAge ⇔ dob > cutoff − maxAge years,
 * and the athlete belongs to the youngest category they fit, so they must not fit the previous one.
 */
export function dobRangeFor(name: string, cutoff: string, categories: AgeCategoryLike[]): Prisma.StringNullableFilter | null {
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const i = sorted.findIndex((c) => c.name === name);
  if (i < 0) return null;
  const cur = sorted[i];
  const prev = sorted.slice(0, i).reverse().find((c) => c.maxAge !== null);
  return { ...(cur.maxAge !== null ? { gt: yearsBefore(cutoff, cur.maxAge) } : {}), ...(prev?.maxAge != null ? { lte: yearsBefore(cutoff, prev.maxAge) } : {}), not: null };
}

export async function studentWhere(f: StudentFilters): Promise<Prisma.StudentWhereInput> {
  const and: Prisma.StudentWhereInput[] = [];
  // Drafts are excluded unless explicitly requested.
  and.push(f.status && isStatus(f.status) ? { status: f.status } : { status: { not: "DRAFT" } });
  if (f.view === "ready") and.push({ status: "VERIFIED", checks: { none: { passed: false } }, ageConcerns: { none: { status: "OPEN" } }, OR: [{ studentType: { not: "OUTSIDE_INDIAN" } }, { college: { trusted: true } }] });
  if (f.view === "dob") and.push({ dobCorrections: { some: { status: "PENDING" } } });
  if (f.view === "concerns") and.push({ ageConcerns: { some: { status: "OPEN" } } });
  if (f.view === "changes") and.push({ changeRequests: { some: { status: "PENDING" } } });
  if (f.type && isStudentType(f.type)) and.push({ studentType: f.type });
  if (f.sport) and.push({ registrations: { some: { event: { sportId: f.sport } } } });
  if (f.event) and.push({ registrations: { some: { eventId: f.event, ...(f.weight ? { weightCategoryId: f.weight } : {}) } } });
  else if (f.weight) and.push({ registrations: { some: { weightCategoryId: f.weight } } });
  if (f.college) and.push({ universityName: textMatch(f.college) });
  if (f.gender) and.push({ gender: f.gender });
  if (f.school) and.push({ schoolId: f.school });
  if (f.age) {
    const [settings, cats] = await Promise.all([getSettings(), prisma.ageCategory.findMany()]);
    and.push({ dob: dobRangeFor(f.age, settings.ageCutoffDate, cats) ?? { equals: "__none__" } });
  }
  if (f.q) {
    const q = f.q;
    and.push({ OR: [{ fullName: textMatch(q) }, { prn: { contains: q.toUpperCase() } }, { passportNumber: { contains: q.toUpperCase() } }, { sportsId: { contains: q.toUpperCase() } }, { mobile: { contains: q } }, { email: { contains: q.toLowerCase() } }] });
  }
  return { AND: and };
}

export const PAGE_SIZE = 20;

/** Flagged first (they need a decision), then newest submissions. */
export async function listStudents(f: StudentFilters) {
  const where = await studentWhere(f);
  const include = { registrations: { include: { event: { include: { sport: true } } } }, college: true, ageConcerns: { where: { status: "OPEN" }, select: { id: true } } } as const;
  const skip = ((f.page ?? 1) - 1) * PAGE_SIZE;
  const flaggedWhere = { AND: [where, { status: "FLAGGED" }] };
  const restWhere = { AND: [where, { status: { not: "FLAGGED" } }] };
  const [total, flaggedTotal] = await Promise.all([prisma.student.count({ where }), prisma.student.count({ where: flaggedWhere })]);
  const order = [{ submittedAt: "desc" as const }, { createdAt: "desc" as const }];
  const flagged = skip < flaggedTotal ? await prisma.student.findMany({ where: flaggedWhere, orderBy: order, skip, take: PAGE_SIZE, include }) : [];
  const rest = flagged.length < PAGE_SIZE ? await prisma.student.findMany({ where: restWhere, orderBy: order, skip: Math.max(0, skip - flaggedTotal), take: PAGE_SIZE - flagged.length, include }) : [];
  return { rows: [...flagged, ...rest], total };
}

export async function dashboardStats() {
  const [byStatus, byType, sports, regs, ready] = await Promise.all([
    prisma.student.groupBy({ by: ["status"], _count: true }),
    prisma.student.groupBy({ by: ["studentType"], where: { status: { not: "DRAFT" } }, _count: true }),
    prisma.sport.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.registration.findMany({ where: { student: { status: { not: "DRAFT" } } }, select: { studentId: true, event: { select: { sportId: true } }, student: { select: { status: true } } } }),
    prisma.student.count({ where: await studentWhere({ view: "ready" }) }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  // Distinct students per sport (a student in two events of one sport counts once).
  const bySport = sports.map((sp) => {
    const rs = regs.filter((r) => r.event.sportId === sp.id);
    const all = new Set(rs.map((r) => r.studentId)).size;
    const approved = new Set(rs.filter((r) => r.student.status === "APPROVED").map((r) => r.studentId)).size;
    return { id: sp.id, name: sp.name, total: all, approved };
  });
  return {
    total: byStatus.filter((b) => b.status !== "DRAFT").reduce((a, b) => a + b._count, 0),
    drafts: count("DRAFT"),
    pending: count("PENDING"),
    verified: count("VERIFIED"),
    flagged: count("FLAGGED"),
    approved: count("APPROVED"),
    rejected: count("REJECTED"),
    ready,
    byType: byType.map((t) => ({ type: t.studentType, count: t._count })),
    bySport,
  };
}

/** Things waiting for an admin decision, for the dashboard. */
export async function oversightCounts() {
  const [dobCorrections, ageConcerns, changeRequests, recentDobChanges] = await Promise.all([
    prisma.dobCorrection.count({ where: { status: "PENDING" } }),
    prisma.ageConcern.count({ where: { status: "OPEN" } }),
    prisma.eventChangeRequest.count({ where: { status: "PENDING" } }),
    prisma.auditLog.count({ where: { action: "DOB_CHANGED", createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
  ]);
  return { dobCorrections, ageConcerns, changeRequests, recentDobChanges };
}

type Split = { total: number; approved: number; pending: number; male: number; female: number; byAge: Record<string, number> };
const emptySplit = (): Split => ({ total: 0, approved: 0, pending: 0, male: 0, female: 0, byAge: {} });
function add(s: Split, st: { status: string; gender: string | null; age: string | null }) {
  s.total++;
  if (st.status === "APPROVED") s.approved++;
  else s.pending++;
  if (st.gender === "MALE") s.male++;
  if (st.gender === "FEMALE") s.female++;
  if (st.age) s.byAge[st.age] = (s.byAge[st.age] ?? 0) + 1;
}

/** Sport → event → weight class entry counts, split by gender, age category and approval. Students count once per sport. */
export async function sportsOverview() {
  const [sports, regs, settings, cats] = await Promise.all([
    prisma.sport.findMany({ orderBy: { name: "asc" }, include: { events: { orderBy: { name: "asc" }, include: { ageCategory: true } }, weightCategories: true } }),
    prisma.registration.findMany({ where: { student: ENTRY_HOLDER }, select: { studentId: true, eventId: true, weightCategoryId: true, student: { select: { status: true, gender: true, dob: true } } } }),
    getSettings(),
    prisma.ageCategory.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const ageOf = new Map<string, string | null>();
  for (const r of regs) if (!ageOf.has(r.studentId)) ageOf.set(r.studentId, ageCategoryFor(r.student.dob, settings.ageCutoffDate, cats));
  const info = (r: (typeof regs)[number]) => ({ status: r.student.status, gender: r.student.gender, age: ageOf.get(r.studentId) ?? null });

  const rows = sports.map((sp) => {
    const sportSplit = emptySplit();
    const seen = new Set<string>();
    const events = sp.events.map((ev) => {
      const rs = regs.filter((r) => r.eventId === ev.id);
      const split = emptySplit();
      for (const r of rs) {
        add(split, info(r));
        if (!seen.has(r.studentId)) {
          seen.add(r.studentId);
          add(sportSplit, info(r));
        }
      }
      const weights = sp.isWeightCategory
        ? sp.weightCategories
            .filter((w) => ev.gender === "MIXED" || w.gender === ev.gender)
            .sort((a, b) => (a.maxKg ?? 999) - (b.maxKg ?? 999))
            .map((w) => ({ id: w.id, name: w.name, count: rs.filter((r) => r.weightCategoryId === w.id).length }))
        : [];
      const warnings: string[] = [];
      if (ev.maxEntries != null && split.total >= ev.maxEntries) warnings.push(split.total > ev.maxEntries ? `Over limit by ${split.total - ev.maxEntries}` : "Full");
      if (ev.minEntries != null && split.total > 0 && split.approved < ev.minEntries) warnings.push(`${split.approved}/${ev.minEntries} approved — squad too small`);
      return { id: ev.id, name: ev.name, gender: ev.gender, eventDate: ev.eventDate, venue: ev.venue, minEntries: ev.minEntries, maxEntries: ev.maxEntries, ageLimit: ev.ageCategory?.name ?? null, split, weights, warnings };
    });
    return { id: sp.id, name: sp.name, isTeam: sp.isTeam, split: sportSplit, events };
  });

  // Colleges: how many athletes each sent and how many are approved.
  const students = await prisma.student.findMany({ where: ENTRY_HOLDER, select: { universityName: true, status: true } });
  const colleges = new Map<string, { name: string; total: number; approved: number }>();
  for (const s of students) {
    const name = s.universityName?.trim() || "Unknown";
    const c = colleges.get(name) ?? { name, total: 0, approved: 0 };
    c.total++;
    if (s.status === "APPROVED") c.approved++;
    colleges.set(name, c);
  }
  return { sports: rows, ageCategories: cats.map((c) => c.name), colleges: [...colleges.values()].sort((a, b) => b.total - a.total) };
}

/** Approved athletes who still miss a match-day step. */
export async function missingSteps() {
  const approved = await prisma.student.findMany({
    where: { status: "APPROVED" },
    orderBy: { fullName: "asc" },
    select: {
      id: true, fullName: true, sportsId: true,
      measurements: { take: 1, select: { id: true } },
      registrations: { select: { eventId: true, event: { select: { name: true, sport: { select: { isWeightCategory: true } } } } } },
      weighIns: { select: { eventId: true } },
    },
  });
  return approved
    .map((s) => {
      const missing: string[] = [];
      if (!s.measurements.length) missing.push("Height & weight not recorded");
      for (const r of s.registrations) if (r.event.sport.isWeightCategory && !s.weighIns.some((w) => w.eventId === r.eventId)) missing.push(`No weigh-in for ${r.event.name}`);
      return { id: s.id, name: s.fullName ?? "—", sportsId: s.sportsId, missing };
    })
    .filter((s) => s.missing.length);
}
