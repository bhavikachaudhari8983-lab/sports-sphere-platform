import type { Metadata } from "next";
import { requireStaffPage } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ENTRY_HOLDER } from "@/lib/eligibility";
import { formatIst, registrationWindowProblem, toIstLocal } from "@/lib/tournaments";
import { PageHeader } from "@/components/ui/card";
import { TournamentsPanel, type TournamentRow } from "@/components/admin/tournaments-panel";

export const metadata: Metadata = { title: "Tournaments" };
export const dynamic = "force-dynamic";

export default async function TournamentsPage() {
  await requireStaffPage(["ADMIN"], "/admin/tournaments");
  const [tournaments, events, entries] = await Promise.all([
    prisma.tournament.findMany({ orderBy: [{ status: "asc" }, { startDate: "desc" }], include: { _count: { select: { events: true } } } }),
    prisma.event.findMany({ include: { sport: true }, orderBy: [{ sport: { name: "asc" } }, { name: "asc" }] }),
    prisma.registration.findMany({ where: { student: ENTRY_HOLDER }, select: { event: { select: { tournamentId: true } } } }),
  ]);
  const entryCount = new Map<string, number>();
  for (const r of entries) if (r.event.tournamentId) entryCount.set(r.event.tournamentId, (entryCount.get(r.event.tournamentId) ?? 0) + 1);
  // Active first, then being set up, then archived.
  const order = { ACTIVE: 0, DRAFT: 1, ARCHIVED: 2 } as const;
  const rows: TournamentRow[] = tournaments
    .map((t) => {
      const problem = registrationWindowProblem(t);
      const status = (t.status in order ? t.status : "DRAFT") as TournamentRow["status"];
      return {
        id: t.id, name: t.name, season: t.season, startDate: t.startDate, endDate: t.endDate,
        opensAt: toIstLocal(t.registrationOpensAt), closesAt: toIstLocal(t.registrationClosesAt), status,
        events: t._count.events, entries: entryCount.get(t.id) ?? 0,
        registrationOpen: !problem,
        registrationNote: problem ?? (t.registrationClosesAt ? `Registration open until ${formatIst(t.registrationClosesAt)}` : "Registration open (no closing date set)"),
      };
    })
    .sort((a, b) => order[a.status] - order[b.status]);
  return (
    <div className="space-y-6">
      <PageHeader title="Tournaments" description="Hoop It Up, the Sports Summit and every other competition: dates, registration window and their events." />
      <TournamentsPanel tournaments={rows} events={events.map((e) => ({ id: e.id, label: `${e.sport.name} · ${e.name}${e.active ? "" : " (inactive)"}`, tournamentId: e.tournamentId }))} />
    </div>
  );
}
