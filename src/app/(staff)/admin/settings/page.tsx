import type { Metadata } from "next";
import { requireStaffPage } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/card";
import { AgeCategoriesPanel, CampusesPanel, DeletionPanel, GeneralPanel, SportsPanel, StaffPanel } from "@/components/admin/settings-panels";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  { id: "general", label: "General" },
  { id: "age", label: "Age categories" },
  { id: "campuses", label: "Campuses & schools" },
  { id: "sports", label: "Sports & events" },
  { id: "staff", label: "Staff" },
  { id: "deletion", label: "Deletion & retention" },
];

export default async function SettingsPage() {
  const me = await requireStaffPage(["ADMIN"], "/admin/settings");
  const campuses = await prisma.campus.findMany({ orderBy: { name: "asc" }, include: { schools: { orderBy: { name: "asc" }, include: { _count: { select: { students: true, teams: true } } } } } });
  const [settings, categories, sports, staff, deletions] = await Promise.all([
    getSettings(),
    prisma.ageCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.sport.findMany({
      orderBy: { name: "asc" },
      include: { events: { orderBy: { name: "asc" }, include: { _count: { select: { registrations: true } } } }, weightCategories: { orderBy: [{ gender: "asc" }, { maxKg: "asc" }] } },
    }),
    prisma.staffUser.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }], include: { sport: { select: { name: true } } } }),
    prisma.deletionRequest.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Sports, events, categories, staff accounts and data protection." />
      <nav aria-label="Settings sections" className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-4 text-small font-medium hover:bg-surface-2">
            {s.label}
          </a>
        ))}
      </nav>
      <GeneralPanel initial={settings} />
      <AgeCategoriesPanel categories={categories} />
      <CampusesPanel campuses={campuses.map((c) => ({ id: c.id, name: c.name, code: c.code, active: c.active, schools: c.schools.map((s) => ({ id: s.id, name: s.name, code: s.code, active: s.active, students: s._count.students, teams: s._count.teams })) }))} />
      <SportsPanel
        ageCategories={categories.filter((c) => c.maxAge !== null).map((c) => ({ id: c.id, name: c.name }))}
        sports={sports.map((s) => ({
          ...s,
          weightCategories: [...s.weightCategories].sort((a, b) => (a.gender === b.gender ? (a.maxKg ?? 999) - (b.maxKg ?? 999) : 0)),
        }))}
      />
      <StaffPanel
        currentId={me.id}
        isSuperAdmin={me.role === "SUPER_ADMIN"}
        sports={sports.map((s) => ({ id: s.id, name: s.name }))}
        staff={staff.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, sport: u.sport?.name ?? null }))}
      />
      <DeletionPanel
        retentionDays={settings.retentionDays}
        requests={deletions.map((d) => ({ id: d.id, studentId: d.studentId, studentLabel: d.studentLabel, reason: d.reason, status: d.status, createdAt: d.createdAt.toISOString(), processedAt: d.processedAt?.toISOString() ?? null }))}
      />
    </div>
  );
}
