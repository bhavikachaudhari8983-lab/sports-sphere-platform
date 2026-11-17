import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, CheckCircle2, Lock, Repeat, ShieldQuestion, XCircle } from "lucide-react";
import { requireStaffPage } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getAgeCategory } from "@/lib/registration";
import { dobImpact, verificationBlockers } from "@/lib/workflow";
import { CHECK_LABEL, DOB_SOURCE_LABEL, DOC_LABEL, GENDER_LABEL, ID_DOC_LABEL, isDocType, isStatus, STUDENT_TYPE_LABEL, type CheckType, type DobSource, type Gender, type IdDocType, type StudentType } from "@/lib/constants";
import { formatDateTime, formatDob } from "@/lib/utils";
import { isMinor } from "@/lib/age";
import { Card, CardBody, CardHeader, DefinitionList } from "@/components/ui/card";
import { Alert, Badge, StatusBadge } from "@/components/ui/badge";
import { PhotoCompare } from "@/components/admin/photo-compare";
import { DocumentViewer } from "@/components/admin/document-viewer";
import { StudentActions } from "@/components/admin/student-actions";
import { AuditList } from "@/components/admin/audit-list";
import { ReviewPresence } from "@/components/admin/review-presence";
import { DecisionButtons } from "@/components/admin/decision-buttons";

export const metadata: Metadata = { title: "Student" };

export default async function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireStaffPage(["ADMIN"], `/admin/students/${id}`);
  const s = await prisma.student.findUnique({
    where: { id },
    include: {
      documents: { orderBy: { createdAt: "asc" } },
      checks: { orderBy: { createdAt: "asc" } },
      college: true,
      school: { include: { campus: true } },
      registrations: { include: { event: { include: { sport: true } }, weightCategory: true } },
      measurements: { orderBy: { createdAt: "desc" }, include: { measuredBy: { select: { name: true } } } },
      weighIns: { orderBy: { createdAt: "desc" }, include: { event: true, recordedBy: { select: { name: true } } } },
      dobCorrections: { where: { status: "PENDING" } },
      ageConcerns: { orderBy: { createdAt: "desc" } },
      changeRequests: { where: { status: "PENDING" }, include: { fromEvent: true, toEvent: true } },
    },
  });
  if (!s) notFound();
  const dobPending = s.dobCorrections[0] ?? null;
  const impact = dobPending ? await dobImpact(s.id, dobPending.toDob) : null;
  const openConcerns = s.ageConcerns.filter((c) => c.status === "OPEN");
  const closedConcerns = s.ageConcerns.filter((c) => c.status !== "OPEN");
  const audits = await prisma.auditLog.findMany({ where: { studentId: id }, orderBy: { createdAt: "desc" }, take: 100 });
  const { ageCategory } = await getAgeCategory(s.dob);
  const status = isStatus(s.status) ? s.status : "DRAFT";
  const blockers = status === "VERIFIED" ? [] : verificationBlockers({ ...s, measurements: s.measurements.slice(0, 1) });
  const approveBlockers = s.studentType === "OUTSIDE_INDIAN" && !s.college?.trusted ? ["college not confirmed"] : [];

  const docs = s.documents.filter((d) => isDocType(d.type));
  const label = (d: (typeof docs)[number]) => {
    const base = DOC_LABEL[d.type as keyof typeof DOC_LABEL];
    return d.type === "REFERENCE_PHOTO" ? `${d.source === "ERP" ? "ERP" : d.source === "PASSPORT" ? "Passport" : "DigiLocker"} photo` : base;
  };
  const reference = docs.filter((d) => d.type === "REFERENCE_PHOTO").map((d) => ({ id: d.id, label: label(d) }));
  const submitted = docs.filter((d) => d.type === "SELFIE" || d.type === "PHOTO").map((d) => ({ id: d.id, label: label(d) }));
  const failedChecks = s.checks.filter((c) => !c.passed);

  return (
    <div className="space-y-6">
      <Link href="/admin#students" className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-medium text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> All students
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[clamp(1.75rem,4vw,2.5rem)] text-fg">{s.fullName ?? "Unverified applicant"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <Badge>{STUDENT_TYPE_LABEL[s.studentType as StudentType] ?? s.studentType}</Badge>
            {ageCategory && <Badge>Age {ageCategory}</Badge>}
            {s.sportsId && <Badge tone="success"><span className="font-mono">{s.sportsId}</span></Badge>}
            {isMinor(s.dob) && <Badge tone="warning">Under 18</Badge>}
            {s.deletionRequestedAt && <Badge tone="danger">Deletion requested</Badge>}
          </div>
        </div>
      </div>

      <ReviewPresence studentId={s.id} />

      {dobPending && impact && (
        <Alert tone="danger" icon={<CalendarClock className="size-5" aria-hidden />} title="DOB correction waiting for a second admin">
          <p>
            <strong>{formatDob(dobPending.fromDob)}</strong> → <strong>{formatDob(dobPending.toDob)}</strong>, proposed by {dobPending.requestedByName} on {formatDateTime(dobPending.createdAt)}.
          </p>
          <p className="mt-1">Reason: {dobPending.reason}</p>
          <p className="mt-1">
            Age category: {impact.fromCategory ?? "—"} → <strong>{impact.toCategory ?? "—"}</strong>
            {impact.ineligible.length > 0 ? (
              <>
                . <strong>No longer eligible for {impact.ineligible.map((i) => i.event).join(", ")}</strong> — approving will flag the registration so the student can withdraw or be moved.
              </>
            ) : (
              ". All current events stay eligible."
            )}
          </p>
          <div className="mt-3">
            <DecisionButtons
              studentId={s.id}
              disabledReason={dobPending.requestedById === me.id ? "You proposed this, so a different admin must approve it." : undefined}
              yes={{ label: "Approve correction", tone: "danger", title: "Apply this DOB correction?", description: "The verified date of birth is replaced and the age category recalculated. Both admins are named in the audit log.", body: { action: "decide-dob", correctionId: dobPending.id, approve: true }, done: "DOB corrected" }}
              no={{ label: "Decline", tone: "primary", title: "Decline this correction?", description: "The date of birth stays as it is.", body: { action: "decide-dob", correctionId: dobPending.id, approve: false }, done: "Correction declined" }}
            />
          </div>
        </Alert>
      )}

      {openConcerns.map((c) => (
        <Alert key={c.id} tone="warning" icon={<ShieldQuestion className="size-5" aria-hidden />} title={`Age concern raised by ${c.raisedByName} (${c.raisedByRole.toLowerCase()})`}>
          <p>“{c.reason}” — {formatDateTime(c.createdAt)}</p>
          <p className="mt-1 text-small">
            Check the DigiLocker photo against the athlete, the Class 10 certificate and, if needed, ask for the original birth certificate or a medical age assessment. The athlete is not told who raised it.
          </p>
          <div className="mt-3">
            <DecisionButtons
              studentId={s.id}
              yes={{ label: "Uphold — flag registration", tone: "danger", title: "Uphold this concern?", description: "The registration is flagged and the student is asked to bring original birth documents. If the DOB is wrong, propose a correction or reject.", body: { action: "resolve-concern", concernId: c.id, outcome: "UPHELD" }, done: "Concern upheld" }}
              no={{ label: "Dismiss", tone: "primary", title: "Dismiss this concern?", description: "Say what you checked, e.g. “Original birth certificate seen, matches DigiLocker”.", body: { action: "resolve-concern", concernId: c.id, outcome: "DISMISSED" }, done: "Concern dismissed" }}
            />
          </div>
        </Alert>
      ))}

      {s.changeRequests.map((r) => (
        <Alert key={r.id} tone="info" icon={<Repeat className="size-5" aria-hidden />} title="Event change requested">
          <p>
            {r.fromEvent.name} → <strong>{r.toEvent.name}</strong> · {formatDateTime(r.createdAt)}
          </p>
          <p className="mt-1">Reason: {r.reason}</p>
          <div className="mt-3">
            <DecisionButtons
              studentId={s.id}
              yes={{ label: "Approve change", tone: "success", title: "Move the student to the new event?", description: "Eligibility and entry limits are checked again now.", body: { action: "decide-change", requestId: r.id, approve: true }, done: "Event changed" }}
              no={{ label: "Decline", tone: "primary", title: "Decline this change?", description: "The student stays in their current event and sees your note.", body: { action: "decide-change", requestId: r.id, approve: false }, done: "Change declined" }}
            />
          </div>
        </Alert>
      ))}

      {s.statusReason && (status === "FLAGGED" || status === "REJECTED") && (
        <Alert tone={status === "REJECTED" ? "danger" : "info"} title={`Reason shown to student`}>
          {s.statusReason}
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Photo comparison" description="Compare the verified-source photo with the live selfie and uploaded photo." />
            <CardBody>
              <PhotoCompare reference={reference} submitted={submitted} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Automatic checks" description={failedChecks.length ? `${failedChecks.length} mismatch${failedChecks.length > 1 ? "es" : ""}` : "All passed"} />
            <CardBody>
              {s.checks.length === 0 ? (
                <p className="text-muted">No checks recorded yet.</p>
              ) : (
                <ul className="space-y-2">
                  {s.checks.map((c) => (
                    <li key={c.id} className="flex gap-3 rounded-lg bg-surface-2 p-3">
                      {c.passed ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-fg" aria-label="Passed" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-danger-fg" aria-label="Failed" />}
                      <div className="min-w-0">
                        <p className="font-medium">{CHECK_LABEL[c.type as CheckType] ?? c.type}</p>
                        {(c.expected || c.actual) && (
                          <p className="text-small break-words">
                            Record: <span className="font-mono">{c.type.includes("DOB") ? formatDob(c.expected) : c.expected}</span> · Verified source: <span className="font-mono">{c.type.includes("DOB") ? formatDob(c.actual) : c.actual}</span>
                          </p>
                        )}
                        {c.details && <p className="text-small text-muted">{c.details}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Identity" />
            <CardBody>
              <DefinitionList
                items={[
                  { label: "Full name", value: s.fullName },
                  {
                    label: "Date of birth",
                    value: (
                      <span className="inline-flex items-center gap-1.5">
                        {formatDob(s.dob)} {s.dobLocked && <Lock className="size-3.5 text-muted" aria-label="Locked" />}
                        <span className="text-small font-normal text-muted">({s.dobSource ? DOB_SOURCE_LABEL[s.dobSource as DobSource] ?? s.dobSource : "unverified"})</span>
                      </span>
                    ),
                  },
                  { label: "Gender", value: s.gender ? GENDER_LABEL[s.gender as Gender] ?? s.gender : "—" },
                  ...(s.studentType === "INTERNATIONAL"
                    ? [
                        { label: "Passport", value: <span className="font-mono">{s.nationality} · {s.passportNumber}</span> },
                        { label: "Passport expiry", value: formatDob(s.passportExpiry) },
                        { label: "MRZ check", value: s.mrzValid ? "Valid" : "Not checked" },
                        { label: "Passport chip/MRZ at desk", value: s.passportDeskVerified ? `Verified ${formatDateTime(s.passportDeskVerifiedAt)}` : "Not yet" },
                      ]
                    : [
                        { label: "Aadhaar (masked)", value: s.aadhaarLast4 ? <span className="font-mono">XXXX XXXX {s.aadhaarLast4}</span> : "—" },
                        ...(s.dobSource === "MANUAL"
                          ? [
                              { label: "Government ID", value: s.identityDocType ? ID_DOC_LABEL[s.identityDocType as IdDocType] ?? s.identityDocType : "—" },
                              { label: "Original ID at desk", value: s.identityDocDeskVerified ? `Checked ${formatDateTime(s.identityDocDeskVerifiedAt)}` : "Not yet" },
                            ]
                          : []),
                      ]),
                  { label: "Mobile", value: s.mobile },
                  { label: "Email", value: <span className="break-all">{s.email}</span> },
                  { label: "Address", value: s.address },
                  { label: "Blood group", value: s.bloodGroup },
                  { label: "Emergency contact", value: s.emergencyName ? `${s.emergencyName} · ${s.emergencyPhone ?? ""}` : "—" },
                  { label: "Medical conditions", value: s.medicalConditions ? "Declared — visible to medical staff only" : "None declared" },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Academic & sports" />
            <CardBody className="space-y-4">
              <DefinitionList
                items={[
                  { label: "University / college", value: s.universityName },
                  ...(s.school ? [{ label: "School (from ERP)", value: `${s.school.name} · ${s.school.campus.name}` }] : []),
                  ...(s.studentType === "OUTSIDE_INDIAN" ? [{ label: "College status", value: s.college?.trusted ? `Confirmed ${formatDateTime(s.college.confirmedAt)}` : "Awaiting confirmation" }, { label: "College office email", value: s.collegeOfficeEmail }] : []),
                  { label: "PRN / enrollment", value: s.prn ? <span className="font-mono">{s.prn}</span> : "—" },
                  { label: "Course", value: s.course ? `${s.course}${s.year ? ` · Year ${s.year}` : ""}` : "—" },
                  { label: "APAAR / ABC ID", value: s.apaarId || "—" },
                  { label: "Playing position", value: s.playingPosition || "—" },
                ]}
              />
              <div>
                <p className="mb-2 text-small text-muted">Events</p>
                <ul className="space-y-1">
                  {s.registrations.map((r) => (
                    <li key={r.id} className="rounded-lg bg-surface-2 px-3 py-2">
                      {r.event.sport.name} · {r.event.name}
                      {r.weightCategory && <span className="text-muted"> · {r.weightCategory.name}</span>}
                    </li>
                  ))}
                  {s.registrations.length === 0 && <li className="text-muted">None</li>}
                </ul>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Measurements & weigh-ins" description="Entered only by officials." />
            <CardBody className="space-y-4">
              {s.measurements.length === 0 ? (
                <p className="text-muted">Not measured yet.</p>
              ) : (
                <ul className="space-y-1">
                  {s.measurements.map((m) => (
                    <li key={m.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
                      <span className="font-mono tabular">
                        {m.heightCm} cm · {m.weightKg} kg
                      </span>
                      <span className="text-small text-muted">
                        {m.measuredBy.name} · {formatDateTime(m.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {s.weighIns.length > 0 && (
                <ul className="space-y-1">
                  {s.weighIns.map((w) => (
                    <li key={w.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
                      <span>
                        {w.event.name}: <span className="font-mono">{w.weightKg} kg</span> {w.categoryName && `(${w.categoryName})`}{" "}
                        {w.withinCategory === false ? <Badge tone="danger">Outside category</Badge> : w.withinCategory ? <Badge tone="success">Within</Badge> : null}
                      </span>
                      <span className="text-small text-muted">
                        {w.recordedBy.name} · {formatDateTime(w.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Actions" />
            <CardBody>
              <StudentActions
                studentId={s.id}
                name={s.fullName ?? "Applicant"}
                status={status}
                dob={s.dob}
                canConfirmCollege={s.studentType === "OUTSIDE_INDIAN" && !!s.college && !s.college.trusted}
                collegeName={s.college?.name ?? null}
                approveBlockers={approveBlockers}
                version={s.updatedAt.toISOString()}
                dobPending={!!dobPending}
              />
              {status === "PENDING" && blockers.length > 0 && (
                <div className="mt-4 rounded-lg bg-surface-2 p-3 text-small">
                  <p className="font-semibold">Before desk verification:</p>
                  <ul className="list-inside list-disc text-muted">
                    {blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Documents" description="Every view is logged." />
            <CardBody>
              <DocumentViewer docs={docs.map((d) => ({ id: d.id, label: label(d), mimeType: d.mimeType, size: d.size, source: d.source, createdAt: d.createdAt.toISOString() }))} />
            </CardBody>
          </Card>
          {closedConcerns.length > 0 && (
            <Card>
              <CardHeader title="Past age concerns" />
              <CardBody>
                <ul className="space-y-2 text-small">
                  {closedConcerns.map((c) => (
                    <li key={c.id} className="rounded-lg bg-surface-2 p-3">
                      <Badge tone={c.status === "UPHELD" ? "danger" : "neutral"}>{c.status === "UPHELD" ? "Upheld" : "Dismissed"}</Badge>
                      <p className="mt-1">“{c.reason}” — {c.raisedByName}</p>
                      <p className="text-muted">
                        {c.resolvedByName}: {c.resolution}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Timeline" />
            <CardBody>
              <DefinitionList
                className="sm:grid-cols-1"
                items={[
                  { label: "Started", value: formatDateTime(s.createdAt) },
                  { label: "Submitted", value: formatDateTime(s.submittedAt) },
                  { label: "Verified", value: formatDateTime(s.verifiedAt) },
                  { label: "Approved", value: formatDateTime(s.approvedAt) },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Audit history" description="Most recent first" />
        <CardBody>
          <AuditList entries={audits} />
        </CardBody>
      </Card>
    </div>
  );
}
