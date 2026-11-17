import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireStaffPage } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { sideOf } from "@/lib/competition";
import { LiveScorer } from "@/components/competition/live-scorer";
import { canScore } from "@/lib/match-management";
import { EmptyState } from "@/components/ui/feedback";
import { ShieldX } from "lucide-react";

export const metadata: Metadata = { title: "Score match" };

export default async function ScoreMatch({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const me = await requireStaffPage(["ADMIN", "OFFICIAL"], `/score/${matchId}`);
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      event: { include: { sport: true } },
      homeTeam: { include: { school: true } }, awayTeam: { include: { school: true } },
      homeStudent: { select: { id: true, fullName: true, universityName: true, school: { select: { name: true } } } },
      awayStudent: { select: { id: true, fullName: true, universityName: true, school: { select: { name: true } } } },
    },
  });
  if (!m) notFound();
  if (!(await canScore(me, m.id))) {
    return (
      <div className="mx-auto max-w-xl">
        <EmptyState icon={<ShieldX className="size-7" aria-hidden />} title="You aren't the scorer for this match" description="Only the official assigned as scorer can enter its score. Ask the organiser if you should be scoring it." action={<Link href="/score" className="font-semibold underline underline-offset-4">My matches</Link>} />
      </div>
    );
  }
  const home = sideOf(m, "HOME"), away = sideOf(m, "AWAY");
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/score" className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-medium text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> All matches
      </Link>
      <div>
        <p className="text-small text-muted">
          {m.event.sport.name} · {m.event.name}
          {m.division ? ` · ${m.division}` : ""}
        </p>
        <h1 className="text-2xl">{m.roundLabel}</h1>
        {m.event.periods && m.event.periodMinutes && (
          <p className="text-small text-muted">
            {m.event.periods} × {m.event.periodMinutes} min{m.event.shootout ? " · shoot-out if tied" : ""}
          </p>
        )}
      </div>
      {!home || !away ? (
        <p className="text-muted">Both sides aren&apos;t known yet.</p>
      ) : (
        <LiveScorer
          matchId={m.id}
          home={home.name}
          away={away.name}
          homeShort={home.short}
          awayShort={away.short}
          initialHome={m.homeScore ?? 0}
          initialAway={m.awayScore ?? 0}
          knockout={m.event.format === "KNOCKOUT"}
          shootout={m.event.shootout}
          finished={m.status === "COMPLETED" || m.status === "WALKOVER"}
        />
      )}
    </div>
  );
}
