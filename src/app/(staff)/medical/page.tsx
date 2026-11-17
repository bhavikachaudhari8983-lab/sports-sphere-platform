import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { HeartPulse, Phone, Search } from "lucide-react";
import { requireStaffPage } from "@/lib/rbac";
import { announcementsForStaff } from "@/lib/announcements";
import { AnnouncementList } from "@/components/competition/announcement-list";
import { prisma } from "@/lib/prisma";
import { isMinor } from "@/lib/age";
import { isStatus } from "@/lib/constants";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { DocumentViewer } from "@/components/admin/document-viewer";
import { textMatch } from "@/lib/text-match";

export const metadata: Metadata = { title: "Medical" };

/** Medical staff see ONLY medical fields: no ID documents, Aadhaar, passport or address. */
export default async function MedicalPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  await requireStaffPage(["MEDICAL"], "/medical");
  const notices = await announcementsForStaff("MEDICAL", 3);
  const { q: rawQ, filter } = await searchParams;
  const q = rawQ?.trim();
  const where: Prisma.StudentWhereInput = {
    AND: [
      { status: { in: ["PENDING", "VERIFIED", "APPROVED", "FLAGGED"] } },
      q ? { OR: [{ fullName: textMatch(q) }, { sportsId: { contains: q.toUpperCase() } }] } : {},
      filter === "conditions" ? { medicalConditions: { not: null } } : {},
    ],
  };
  const rows = await prisma.student.findMany({
    where,
    orderBy: { fullName: "asc" },
    take: 100,
    select: {
      id: true, fullName: true, status: true, dob: true, bloodGroup: true, medicalConditions: true, emergencyName: true, emergencyPhone: true, sportsId: true,
      registrations: { select: { event: { select: { name: true, sport: { select: { name: true } } } } } },
      documents: { where: { type: { in: ["MEDICAL_CERT", "GUARDIAN_CONSENT"] } }, select: { id: true, type: true, mimeType: true, size: true, source: true, createdAt: true } },
    },
  });
  const shown = filter === "minors" ? rows.filter((r) => isMinor(r.dob)) : rows;

  return (
    <div className="space-y-6">
      <PageHeader title="Medical" description="Fitness certificates, declared conditions, blood groups and emergency contacts. Visible to the medical team only." />
      {notices.length > 0 && (
        <section aria-label="Announcements" className="mb-6">
          <AnnouncementList items={notices} />
        </section>
      )}
      <form method="get" className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]" role="search">
        <label className="relative">
          <span className="sr-only">Search by name or Sports ID</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" name="q" defaultValue={q} placeholder="Name or Sports ID" className="pl-9" />
        </label>
        <label>
          <span className="sr-only">Filter</span>
          <Select name="filter" defaultValue={filter ?? ""}>
            <option value="">All athletes</option>
            <option value="conditions">With declared conditions</option>
            <option value="minors">Under 18</option>
          </Select>
        </label>
        <Button type="submit">Apply</Button>
      </form>
      {shown.length === 0 ? (
        <EmptyState icon={<HeartPulse className="size-7" aria-hidden />} title="No athletes found" description="Try another search or filter." />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {shown.map((r) => (
            <li key={r.id}>
              <Card className="h-full">
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="mr-auto font-heading text-xl font-semibold">{r.fullName}</p>
                    {isStatus(r.status) && <StatusBadge status={r.status} />}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="danger">Blood {r.bloodGroup ?? "?"}</Badge>
                    {isMinor(r.dob) && <Badge tone="warning">Under 18</Badge>}
                    {r.sportsId && <Badge><span className="font-mono">{r.sportsId}</span></Badge>}
                  </div>
                  <p className="text-small text-muted">{r.registrations.map((x) => `${x.event.sport.name} · ${x.event.name}`).join("; ")}</p>
                  <div className="rounded-lg bg-surface-2 p-3">
                    <p className="text-small font-semibold">Declared conditions</p>
                    <p className="whitespace-pre-wrap">{r.medicalConditions ?? "None declared"}</p>
                  </div>
                  {r.emergencyPhone && (
                    <a href={`tel:${r.emergencyPhone}`} className="inline-flex min-h-11 items-center gap-2 font-medium underline underline-offset-4">
                      <Phone className="size-4" aria-hidden /> {r.emergencyName} · {r.emergencyPhone}
                    </a>
                  )}
                  <DocumentViewer docs={r.documents.map((d) => ({ id: d.id, label: d.type === "MEDICAL_CERT" ? "Medical fitness certificate" : "Guardian consent", mimeType: d.mimeType, size: d.size, source: d.source, createdAt: d.createdAt.toISOString() }))} />
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
