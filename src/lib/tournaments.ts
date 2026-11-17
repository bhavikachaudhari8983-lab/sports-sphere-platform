// Tournaments: Hoop It Up 2027, Sports Summit 2027… Each groups events and sets the registration window.
// (Relative imports only: this file is also used by the seed and by scripts/backfill-tournaments.ts.)
import type { Tournament } from "@prisma/client";
import { prisma } from "./prisma";
import { ApiError } from "./api";
import { audit, type Actor } from "./audit";
import { getSettings } from "./settings";

export const TOURNAMENT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];
export const TOURNAMENT_STATUS_LABEL: Record<TournamentStatus, string> = { DRAFT: "Being set up", ACTIVE: "Active", ARCHIVED: "Archived" };

/** Dates are shown and entered in Indian time: the events are in India, whatever timezone the device uses. */
const IST = "Asia/Kolkata";
export function formatIst(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("en-IN", { timeZone: IST, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
/** "2027-08-01T09:00" typed in an admin form (Indian time) → a Date. */
export function parseIstLocal(v: string | null | undefined): Date | null {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new ApiError(400, "Enter a valid date and time");
  const d = new Date(`${v}:00+05:30`);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, "Enter a valid date and time");
  return d;
}
/** Date → "2027-08-01T09:00" in Indian time, for <input type="datetime-local">. */
export function toIstLocal(d: Date | null | undefined): string {
  if (!d) return "";
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  return ist.toISOString().slice(0, 16);
}

type WindowFields = Pick<Tournament, "name" | "status" | "registrationOpensAt" | "registrationClosesAt">;

/**
 * Why students can't register for this tournament's events right now, or null if registration is open.
 * Events without a tournament keep the old behaviour (always open).
 */
export function registrationWindowProblem(t: WindowFields | null | undefined, now = new Date()): string | null {
  if (!t) return null;
  if (t.status === "DRAFT") return `Registration for ${t.name} isn't open yet`;
  if (t.status === "ARCHIVED") return `${t.name} has finished`;
  if (t.registrationOpensAt && now < t.registrationOpensAt) return `Registration for ${t.name} opens on ${formatIst(t.registrationOpensAt)}`;
  if (t.registrationClosesAt && now > t.registrationClosesAt) return `Registration for ${t.name} closed on ${formatIst(t.registrationClosesAt)}`;
  return null;
}

export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60) || "tournament";
}

async function uniqueSlug(name: string, exceptId?: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const hit = await prisma.tournament.findUnique({ where: { slug }, select: { id: true } });
    if (!hit || hit.id === exceptId) return slug;
  }
  throw new ApiError(409, "Choose a different name");
}

export type TournamentInput = {
  name: string;
  season: string;
  startDate: string | null;
  endDate: string | null;
  registrationOpensAt: string | null; // "YYYY-MM-DDTHH:mm", Indian time
  registrationClosesAt: string | null;
  status: TournamentStatus;
};

function checkInput(input: TournamentInput) {
  const opens = parseIstLocal(input.registrationOpensAt);
  const closes = parseIstLocal(input.registrationClosesAt);
  if (opens && closes && closes <= opens) throw new ApiError(400, "Registration must close after it opens.", { registrationClosesAt: "Must be after the opening time" });
  if (input.startDate && input.endDate && input.endDate < input.startDate) throw new ApiError(400, "The tournament must end on or after its first day.", { endDate: "Must be on or after the start date" });
  return { opens, closes };
}

export async function createTournament(input: TournamentInput, actor: Actor, ip: string | null) {
  const { opens, closes } = checkInput(input);
  const t = await prisma.tournament.create({
    data: { name: input.name.trim(), slug: await uniqueSlug(input.name), season: input.season.trim(), startDate: input.startDate, endDate: input.endDate, registrationOpensAt: opens, registrationClosesAt: closes, status: input.status },
  });
  await audit({ actor, action: "TOURNAMENT_CHANGED", entityType: "Tournament", entityId: t.id, summary: `Tournament created: ${t.name} (${t.season})`, ip });
  return t;
}

export async function updateTournament(id: string, input: TournamentInput, actor: Actor, ip: string | null) {
  const old = await prisma.tournament.findUnique({ where: { id } });
  if (!old) throw new ApiError(404, "Tournament not found");
  const { opens, closes } = checkInput(input);
  const t = await prisma.tournament.update({
    where: { id },
    data: { name: input.name.trim(), slug: old.name === input.name.trim() ? old.slug : await uniqueSlug(input.name, id), season: input.season.trim(), startDate: input.startDate, endDate: input.endDate, registrationOpensAt: opens, registrationClosesAt: closes, status: input.status },
  });
  const changes: string[] = [];
  if (old.status !== t.status) changes.push(`status ${old.status} → ${t.status}`);
  if (old.registrationOpensAt?.getTime() !== t.registrationOpensAt?.getTime() || old.registrationClosesAt?.getTime() !== t.registrationClosesAt?.getTime()) changes.push(`registration ${formatIst(t.registrationOpensAt)} – ${formatIst(t.registrationClosesAt)}`);
  await audit({ actor, action: "TOURNAMENT_CHANGED", entityType: "Tournament", entityId: id, summary: `Tournament updated: ${t.name}${changes.length ? ` (${changes.join("; ")})` : ""}`, ip });
  return t;
}

export async function deleteTournament(id: string, actor: Actor, ip: string | null) {
  const t = await prisma.tournament.findUnique({ where: { id }, include: { _count: { select: { events: true } } } });
  if (!t) throw new ApiError(404, "Tournament not found");
  if (t._count.events) throw new ApiError(409, "Move or remove this tournament's events first. Finished tournaments should be archived, not deleted, so their history is kept.");
  await prisma.tournament.delete({ where: { id } });
  await audit({ actor, action: "TOURNAMENT_CHANGED", entityType: "Tournament", entityId: id, summary: `Tournament deleted: ${t.name}`, ip });
}

/** Puts every event that has no tournament into one (created if needed). Used once when upgrading, and by the seed. */
export async function ensureDefaultTournament(opts: { name?: string; season?: string } = {}) {
  const orphans = await prisma.event.count({ where: { tournamentId: null } });
  if (!orphans) return null;
  const settings = await getSettings();
  const name = opts.name ?? settings.meetName;
  const year = new Date().getFullYear();
  const season = opts.season ?? `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
  const t = (await prisma.tournament.findFirst({ where: { name } })) ?? (await prisma.tournament.create({ data: { name, slug: await uniqueSlug(name), season, status: "ACTIVE" } }));
  const { count } = await prisma.event.updateMany({ where: { tournamentId: null }, data: { tournamentId: t.id } });
  return { tournament: t, moved: count };
}
