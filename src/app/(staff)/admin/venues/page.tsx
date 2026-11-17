import type { Metadata } from "next";
import { requireStaffPage } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/card";
import { VenuesPanel } from "@/components/admin/venues-panel";

export const metadata: Metadata = { title: "Venues & courts" };
export const dynamic = "force-dynamic";

export default async function VenuesPage() {
  await requireStaffPage(["ADMIN"], "/admin/venues");
  const venues = await prisma.venue.findMany({
    orderBy: { name: "asc" },
    include: { courts: { orderBy: { name: "asc" }, include: { _count: { select: { matches: { where: { status: { in: ["SCHEDULED", "LIVE"] } } } } } } } },
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Venues & courts" description="Where matches are played. Each match can be scheduled onto a court, and two matches can never overlap on the same court." />
      <VenuesPanel venues={venues.map((v) => ({ id: v.id, name: v.name, address: v.address, courts: v.courts.map((c) => ({ id: c.id, name: c.name, active: c.active, upcoming: c._count.matches })) }))} />
    </div>
  );
}
