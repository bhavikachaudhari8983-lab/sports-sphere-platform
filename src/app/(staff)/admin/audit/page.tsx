import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { Search } from "lucide-react";
import { requireStaffPage } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { AuditList } from "@/components/admin/audit-list";
import { Pagination } from "@/components/admin/students-table";
import { textMatch } from "@/lib/text-match";

export const metadata: Metadata = { title: "Audit log" };
const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaffPage(["ADMIN"], "/admin/audit");
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const action = sp.action && (AUDIT_ACTIONS as readonly string[]).includes(sp.action) ? sp.action : undefined;
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : undefined;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.AuditLogWhereInput = {
    AND: [
      q ? { OR: [{ summary: textMatch(q) }, { actorName: textMatch(q) }, { studentId: q }, { ip: { contains: q } }] } : {},
      action ? { action } : {},
      from ? { createdAt: { gte: new Date(`${from}T00:00:00+05:30`) } } : {},
      to ? { createdAt: { lte: new Date(`${to}T23:59:59+05:30`) } } : {},
    ],
  };
  const [entries, total] = await Promise.all([prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }), prisma.auditLog.count({ where })]);

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Every login, document view, status change, DOB change, measurement and weigh-in. Entries cannot be edited or deleted." />
      <form method="get" className="grid gap-3 rounded-xl border border-border bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_1fr_1fr_auto]">
        <label className="relative block">
          <span className="sr-only">Search summary, person or IP</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" name="q" defaultValue={q} placeholder="Search text, staff name, IP…" className="pl-9" />
        </label>
        <label>
          <span className="sr-only">Action</span>
          <Select name="action" defaultValue={action ?? ""}>
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className="text-small text-muted">From</span>
          <Input type="date" name="from" defaultValue={from} />
        </label>
        <label>
          <span className="text-small text-muted">To</span>
          <Input type="date" name="to" defaultValue={to} />
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit">Search</Button>
          {(q || action || from || to) && (
            <ButtonLink href="/admin/audit" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </div>
      </form>
      <Card>
        <CardBody>
          <AuditList entries={entries} showStudentLink />
        </CardBody>
      </Card>
      <Pagination page={page} total={total} pageSize={PAGE} params={{ q, action, from, to }} />
    </div>
  );
}
