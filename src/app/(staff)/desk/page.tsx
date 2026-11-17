import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { requireStaffPage } from "@/lib/rbac";
import { announcementsForStaff } from "@/lib/announcements";
import { AnnouncementList } from "@/components/competition/announcement-list";
import { prisma } from "@/lib/prisma";
import { getAgeCategory } from "@/lib/registration";
import { verificationBlockers } from "@/lib/workflow";
import { CHECK_LABEL, GENDER_LABEL, ID_DOC_LABEL, isStatus, STUDENT_TYPE_LABEL, type CheckType, type Gender, type IdDocType, type StudentType } from "@/lib/constants";
import { formatDob } from "@/lib/utils";
import { Card, CardBody, CardHeader, DefinitionList, PageHeader } from "@/components/ui/card";
import { Alert, Badge, StatusBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { PhotoCompare } from "@/components/admin/photo-compare";
import { DeskPanel } from "@/components/desk/desk-panel";
import { AgeConcernButton } from "@/components/staff/age-concern-button";
import { textMatch } from "@/lib/text-match";

export const metadata: Metadata = { title: "Verification desk" };

export default async function DeskPage({ searchParams }: { searchParams: Promise<{ q?: string; id?: string }> }) {
  const me = await requireStaffPage(["OFFICIAL", "ADMIN"], "/desk");
  const notices = me.role === "OFFICIAL" ? await announcementsForStaff("OFFICIAL", 3) : [];
  const { q: rawQ, id } = await searchParams;
  const q = rawQ?.trim();

  const results = q
    ? await prisma.student.findMany({
        where: {
          status: { not: "DRAFT" },
          OR: [{ fullName: textMatch(q) }, { prn: { contains: q.toUpperCase() } }, { passportNumber: { contains: q.toUpperCase() } }, { sportsId: { contains: q.toUpperCase() } }],
        },
        orderBy: { fullName: "asc" },
        take: 20,
        select: { id: true, fullName: true, status: true, prn: true, passportNumber: true, studentType: true },
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Verification desk" description="Find the athlete, compare photos, measure height and weight, and verify." />
      {notices.length > 0 && (
        <section aria-label="Announcements" className="mb-6">
          <AnnouncementList items={notices} />
        </section>
      )}
      <form method="get" className="flex gap-2" role="search">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search by name, PRN, passport number or Sports ID</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" name="q" defaultValue={q} placeholder="Name, PRN, passport or Sports ID" className="pl-9" autoFocus={!id} />
        </label>
        <Button type="submit">Search</Button>
      </form>

      {id ? (
        <StudentDesk id={id} q={q} />
      ) : q ? (
        results.length ? (
          <ul className="space-y-2">
            {results.map((r) => (
              <li key={r.id}>
                <Link href={`/desk?q=${encodeURIComponent(q)}&id=${r.id}`} className="flex min-h-14 flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-card hover:border-border-strong">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{r.fullName ?? "Unverified"}</span>
                    <span className="block text-small text-muted">
                      {STUDENT_TYPE_LABEL[r.studentType as StudentType]} · <span className="font-mono">{r.prn ?? r.passportNumber ?? "—"}</span>
                    </span>
                  </span>
                  {isStatus(r.status) && <StatusBadge status={r.status} />}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No athlete found" description="Check the spelling, or search by PRN, passport number or Sports ID." />
        )
      ) : (
        <EmptyState icon={<Search className="size-7" aria-hidden />} title="Search for an athlete" description="Ask for their PRN, passport number or Sports ID, or search by name." />
      )}
    </div>
  );
}

async function StudentDesk({ id, q }: { id: string; q?: string }) {
  const s = await prisma.student.findUnique({
    where: { id },
    include: {
      documents: { where: { type: { in: ["REFERENCE_PHOTO", "SELFIE", "PHOTO"] } } },
      checks: true,
      college: true,
      registrations: { include: { event: { include: { sport: true } }, weightCategory: true } },
      measurements: { orderBy: { createdAt: "desc" }, take: 1, include: { measuredBy: { select: { name: true } } } },
      weighIns: { orderBy: { createdAt: "desc" }, include: { recordedBy: { select: { name: true } } } },
      ageConcerns: { where: { status: "OPEN" }, select: { id: true } },
    },
  });
  if (!s || s.status === "DRAFT") return <EmptyState title="Athlete not found" />;
  const { ageCategory } = await getAgeCategory(s.dob);
  const status = isStatus(s.status) ? s.status : "DRAFT";
  const label = (src: string, type: string) => (type === "REFERENCE_PHOTO" ? `${src === "ERP" ? "ERP" : src === "PASSPORT" ? "Passport" : "DigiLocker"} photo` : type === "SELFIE" ? "Live selfie" : "Uploaded photo");
  const failed = s.checks.filter((c) => !c.passed);
  const latest = s.measurements[0];

  return (
    <div className="space-y-6">
      {q && (
        <Link href={`/desk?q=${encodeURIComponent(q)}`} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-medium text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden /> Back to results
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-fg">{s.fullName}</h2>
        <StatusBadge status={status} />
        {ageCategory && <Badge>Age {ageCategory}</Badge>}
        {s.ageConcerns.length > 0 && <Badge tone="warning">Age under review</Badge>}
        <span className="ml-auto">
          <AgeConcernButton studentId={s.id} athleteName={s.fullName ?? undefined} />
        </span>
      </div>
      {status === "FLAGGED" && <Alert tone="info" title="Flagged — admin review needed before verification">{s.statusReason}</Alert>}
      {status === "REJECTED" && <Alert tone="danger" title="Rejected">{s.statusReason}</Alert>}
      {failed.length > 0 && (
        <Alert tone="warning" title="Auto-check mismatches">
          <ul className="list-inside list-disc">
            {failed.map((c) => (
              <li key={c.id}>{CHECK_LABEL[c.type as CheckType] ?? c.type}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Photo comparison" />
            <CardBody>
              <PhotoCompare
                reference={s.documents.filter((d) => d.type === "REFERENCE_PHOTO").map((d) => ({ id: d.id, label: label(d.source, d.type) }))}
                submitted={s.documents.filter((d) => d.type !== "REFERENCE_PHOTO").map((d) => ({ id: d.id, label: label(d.source, d.type) }))}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Identity" />
            <CardBody>
              <DefinitionList
                items={[
                  { label: "Date of birth", value: formatDob(s.dob) },
                  { label: "Gender", value: s.gender ? GENDER_LABEL[s.gender as Gender] : "—" },
                  { label: "Type", value: STUDENT_TYPE_LABEL[s.studentType as StudentType] },
                  { label: "University / college", value: s.universityName },
                  { label: s.studentType === "INTERNATIONAL" ? "Passport" : "PRN", value: <span className="font-mono">{s.studentType === "INTERNATIONAL" ? `${s.nationality} ${s.passportNumber}` : s.prn ?? "—"}</span> },
                  ...(s.studentType === "OUTSIDE_INDIAN" ? [{ label: "College confirmed", value: s.college?.trusted ? "Yes" : "No — admin must confirm" }] : []),
                  { label: "Events", value: s.registrations.map((r) => `${r.event.sport.name} ${r.event.name}${r.weightCategory ? ` (${r.weightCategory.name})` : ""}`).join("; ") || "—" },
                ]}
              />
            </CardBody>
          </Card>
        </div>
        <DeskPanel
          studentId={s.id}
          name={s.fullName ?? "Athlete"}
          status={status}
          isInternational={s.studentType === "INTERNATIONAL"}
          passportVerified={s.passportDeskVerified}
          passportLabel={s.passportNumber ? `${s.nationality} · ${s.passportNumber} · expires ${formatDob(s.passportExpiry)}` : null}
          idCheck={
            s.dobSource === "MANUAL"
              ? { verified: s.identityDocDeskVerified, idLabel: s.identityDocType ? ID_DOC_LABEL[s.identityDocType as IdDocType] ?? "Government ID" : "Government ID", name: s.fullName ?? "—", dob: formatDob(s.dob), aadhaarLast4: s.aadhaarLast4 ?? "????" }
              : null
          }
          blockers={verificationBlockers({ ...s, measurements: s.measurements })}
          latest={latest ? { heightCm: latest.heightCm, weightKg: latest.weightKg, at: latest.createdAt.toISOString(), by: latest.measuredBy.name } : null}
          weighEvents={s.registrations
            .filter((r) => r.event.sport.isWeightCategory)
            .map((r) => {
              const w = s.weighIns.find((x) => x.eventId === r.eventId);
              return {
                eventId: r.eventId,
                label: `${r.event.sport.name} · ${r.event.name}`,
                category: r.weightCategory?.name ?? null,
                latest: w ? { weightKg: w.weightKg, withinCategory: w.withinCategory, at: w.createdAt.toISOString(), by: w.recordedBy.name } : null,
              };
            })}
        />
      </div>
    </div>
  );
}
