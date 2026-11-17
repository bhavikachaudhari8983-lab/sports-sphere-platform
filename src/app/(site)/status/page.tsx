import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Building2, CalendarDays, CheckCircle2, Circle, ClipboardList, Flag, MapPin, Ruler, XCircle } from "lucide-react";
import { getSessionUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { isDemoMode } from "@/lib/env";
import { getAgeCategory } from "@/lib/registration";
import { entryCounts, eventIneligibility } from "@/lib/eligibility";
import { isStatus, STUDENT_TYPE_LABEL, type Status } from "@/lib/constants";
import { formatDateTime, formatDob, cn } from "@/lib/utils";
import { Card, CardBody, CardHeader, DefinitionList } from "@/components/ui/card";
import { Alert, Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { StatusLogin } from "@/components/status/status-login";
import { SessionNotice } from "@/components/status/session-notice";
import { IdCard } from "@/components/status/id-card";
import { DeletionRequestButton } from "@/components/status/deletion-request";
import { SignOutButton } from "@/components/status/sign-out-button";
import { EventChangeButtons, type ChangeOption } from "@/components/status/event-changes";
import { MyGames } from "@/components/status/my-games";
import { AnnouncementList } from "@/components/competition/announcement-list";
import { myGames } from "@/lib/my-games";
import { announcementsForStudent } from "@/lib/announcements";
import { registrationWindowProblem } from "@/lib/tournaments";
import { registrationReference } from "@/lib/notifications";
import { NotificationList } from "@/components/status/notification-list";
import { SSO_ERRORS, ssoPrompt, universitySso } from "@/lib/university-sso";

export const metadata: Metadata = { title: "My account" };
export const dynamic = "force-dynamic";

export default async function StatusPage({ searchParams }: { searchParams: Promise<{ sso?: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "STUDENT") {
    const sso = universitySso();
    const { sso: ssoCode } = await searchParams;
    return (
      <StatusLogin
        demo={isDemoMode()}
        notice={<SessionNotice user={user} wants="STUDENT" />}
        sso={sso ? { ...ssoPrompt(sso), universities: sso.universities.map((u) => u.name) } : null}
        ssoError={ssoCode ? SSO_ERRORS[ssoCode] ?? SSO_ERRORS.failed : null}
      />
    );
  }

  const s = await prisma.student.findUnique({
    where: { id: user.id },
    include: {
      registrations: { include: { event: { include: { sport: true } }, weightCategory: true } },
      college: true,
      deletionRequests: { where: { status: "PENDING" } },
      notifications: { orderBy: { createdAt: "desc" }, take: 20 },
      measurements: { orderBy: { createdAt: "desc" }, take: 1 },
      changeRequests: { orderBy: { createdAt: "desc" }, take: 5, include: { fromEvent: true, toEvent: true } },
    },
  });
  if (!s) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <EmptyState title="Registration not found" description="It may have been deleted at your request." action={<SignOutButton />} />
      </div>
    );
  }

  const status: Status = isStatus(s.status) ? s.status : "DRAFT";
  const { ageCategory, cutoff } = await getAgeCategory(s.dob);
  const [games, notices] = status === "APPROVED" ? await Promise.all([myGames(s.id), announcementsForStudent(s.id)]) : [null, []];
  const canChange = status !== "DRAFT" && status !== "REJECTED";
  const pendingChange = s.changeRequests.find((r) => r.status === "PENDING");
  const lastDecided = s.changeRequests.find((r) => r.status !== "PENDING" && r.decidedAt && Date.now() - r.decidedAt.getTime() < 14 * 86400000 && r.decisionNote !== "Withdrawn by the student");

  // Events this athlete could move to: open to their gender and age, not already entered, places left.
  let options: ChangeOption[] = [];
  if (canChange) {
    const events = await prisma.event.findMany({ where: { active: true, sport: { active: true } }, include: { sport: { include: { weightCategories: true } }, ageCategory: true, tournament: true }, orderBy: [{ sport: { name: "asc" } }, { name: "asc" }] });
    const taken = await entryCounts(events.map((e) => e.id), s.id);
    options = events
      .filter((e) => !s.registrations.some((r) => r.eventId === e.id))
      .filter((e) => !eventIneligibility(e, { gender: s.gender, dob: s.dob, cutoff }))
      .filter((e) => !registrationWindowProblem(e.tournament)) // only events still open for registration
      .filter((e) => e.maxEntries == null || (taken.get(e.id) ?? 0) < e.maxEntries)
      .map((e) => ({
        id: e.id,
        label: `${e.sport.name} · ${e.name}`,
        weights: e.sport.isWeightCategory ? e.sport.weightCategories.filter((w) => w.gender === s.gender).sort((a, b) => (a.maxKg ?? 999) - (b.maxKg ?? 999)).map((w) => ({ id: w.id, name: w.name })) : [],
      }));
  }
  const awaitingCollege = s.studentType === "OUTSIDE_INDIAN" && !s.college?.trusted && status === "PENDING";
  const awaitingPassport = s.studentType === "INTERNATIONAL" && !s.passportDeskVerified && (status === "PENDING" || status === "FLAGGED");
  const awaitingIdCheck = s.dobSource === "MANUAL" && !s.identityDocDeskVerified && (status === "PENDING" || status === "FLAGGED");

  const steps: Array<{ label: string; at: Date | null; done: boolean; note?: string }> = [
    { label: "Registration started", at: s.createdAt, done: true },
    { label: "Submitted", at: s.submittedAt, done: !!s.submittedAt },
    { label: "Verified at the desk", at: s.verifiedAt, done: !!s.verifiedAt, note: "Identity, photo, height and weight checked by an official" },
    { label: "Approved — QR Sports ID issued", at: s.approvedAt, done: status === "APPROVED" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 pb-24 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-muted">Registration status</p>
          <h1 className="text-fg">{s.fullName ?? "Your registration"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            {ageCategory && <Badge tone="neutral">Age category {ageCategory}</Badge>}
            <Badge tone="neutral">{STUDENT_TYPE_LABEL[s.studentType as keyof typeof STUDENT_TYPE_LABEL] ?? s.studentType}</Badge>
            {s.submittedAt && <span className="text-small text-muted">Reference <span className="font-mono font-semibold text-fg">{registrationReference(s.id)}</span></span>}
          </div>
        </div>
        <SignOutButton />
      </div>

      {status === "DRAFT" && (
        <Alert tone="warning" icon={<ClipboardList className="size-5" aria-hidden />} title="Your registration isn't submitted yet">
          <p>Your progress is saved. Finish the remaining steps and submit to join the events.</p>
          <ButtonLink href="/register" className="mt-3">
            Continue registration
          </ButtonLink>
        </Alert>
      )}
      {status === "FLAGGED" && (
        <Alert tone="info" icon={<Flag className="size-5" aria-hidden />} title="Flagged for manual review">
          {s.statusReason ?? "The sports office needs to check your details."}
        </Alert>
      )}
      {status === "REJECTED" && (
        <Alert tone="danger" icon={<XCircle className="size-5" aria-hidden />} title="Registration rejected">
          {s.statusReason ?? "Contact the sports office for details."}
        </Alert>
      )}
      {awaitingCollege && (
        <Alert tone="warning" icon={<Building2 className="size-5" aria-hidden />} title="Waiting for college confirmation">
          We&apos;re confirming your enrolment with {s.college?.name ?? s.universityName}. This usually takes 2–3 working days.
        </Alert>
      )}
      {awaitingPassport && (
        <Alert tone="warning" icon={<AlertTriangle className="size-5" aria-hidden />} title="Bring your original passport">
          An official must check your passport chip/MRZ at the verification desk before you can be verified.
        </Alert>
      )}
      {awaitingIdCheck && (
        <Alert tone="warning" icon={<AlertTriangle className="size-5" aria-hidden />} title="Bring your original Government ID">
          You entered your details with a Government ID. An official must check the original at the verification desk before you can be verified.
        </Alert>
      )}
      {(status === "PENDING" || status === "FLAGGED") && (
        <Alert tone="neutral" icon={<Ruler className="size-5" aria-hidden />} title="Next: visit the verification desk">
          An official will compare your live photo, and measure your height and weight. Students never enter these themselves.
        </Alert>
      )}

      {s.notifications.length > 0 && (
        <Card>
          <CardHeader title="Your messages" description="Updates about your registration from the sports office." />
          <CardBody>
            <NotificationList
              items={s.notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, createdAt: n.createdAt.toISOString(), unread: !n.readAt, emailed: n.emailStatus === "SENT" }))}
            />
          </CardBody>
        </Card>
      )}

      {notices.length > 0 && (
        <Card>
          <CardHeader title="Announcements" />
          <CardBody>
            <AnnouncementList items={notices} />
          </CardBody>
        </Card>
      )}

      {games && <MyGames data={games} />}

      {status === "APPROVED" && (
        <Card>
          <CardHeader title="Your QR Sports ID" description="Show this at every venue." />
          <CardBody>
            <IdCard />
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Progress" />
          <CardBody>
            <ol className="relative space-y-6">
              {steps.map((st, i) => {
                const blocked = (status === "REJECTED" || status === "FLAGGED") && !st.done && steps[i - 1]?.done;
                return (
                  <li key={st.label} className="flex gap-3">
                    <span className="relative flex flex-col items-center">
                      {st.done ? (
                        <CheckCircle2 className="size-6 text-success-fg" aria-hidden />
                      ) : blocked ? (
                        status === "REJECTED" ? <XCircle className="size-6 text-danger-fg" aria-hidden /> : <Flag className="size-6 text-info-fg" aria-hidden />
                      ) : (
                        <Circle className="size-6 text-muted" aria-hidden />
                      )}
                      {i < steps.length - 1 && <span aria-hidden className={cn("absolute top-7 h-[calc(100%+0.5rem)] w-0.5", st.done ? "bg-success" : "bg-border")} />}
                    </span>
                    <div className="min-w-0 pb-1">
                      <p className={cn("font-semibold", st.done ? "text-fg" : "text-muted")}>
                        {st.label}
                        <span className="sr-only">{st.done ? " — done" : blocked ? ` — ${status.toLowerCase()}` : " — not yet"}</span>
                      </p>
                      {st.at && st.done && <p className="text-small text-muted">{formatDateTime(st.at)}</p>}
                      {blocked && <p className="text-small font-medium text-fg">{status === "REJECTED" ? "Rejected" : "On hold — flagged for review"}</p>}
                      {!st.done && !blocked && st.note && <p className="text-small text-muted">{st.note}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Events" description={canChange ? "Withdraw straight away, or ask to change an event. One change request at a time." : undefined} />
          <CardBody>
            {lastDecided && (
              <Alert tone={lastDecided.status === "APPROVED" ? "success" : "neutral"} className="mb-3" title={`Change ${lastDecided.fromEvent.name} → ${lastDecided.toEvent.name} ${lastDecided.status === "APPROVED" ? "approved" : "declined"}`}>
                {lastDecided.decisionNote}
              </Alert>
            )}
            {s.registrations.length === 0 ? (
              <p className="text-muted">No events selected yet.</p>
            ) : (
              <ul className="space-y-3">
                {s.registrations.map((r) => (
                  <li key={r.id} className="rounded-lg bg-surface-2 p-3">
                    <p className="font-semibold">
                      {r.event.sport.name} · {r.event.name}
                    </p>
                    <p className="flex flex-wrap gap-x-3 text-small text-muted">
                      {r.event.eventDate && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3.5" aria-hidden />
                          {formatDob(r.event.eventDate)}
                        </span>
                      )}
                      {r.event.venue && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" aria-hidden />
                          {r.event.venue}
                        </span>
                      )}
                      {r.weightCategory && <span>Weight class {r.weightCategory.name} (weigh-in on event day)</span>}
                    </p>
                    {pendingChange?.fromEventId === r.eventId && <p className="mt-1 text-small font-medium text-info-fg">Change to {pendingChange.toEvent.name} requested — waiting for the sports office.</p>}
                    {canChange && <EventChangeButtons eventId={r.eventId} eventName={r.event.name} options={options} canWithdraw={s.registrations.length > 1} hasPendingRequest={!!pendingChange} />}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Verified details" description="Locked after verification. Contact the sports office if something is wrong." />
        <CardBody>
          <DefinitionList
            items={[
              { label: "Date of birth", value: formatDob(s.dob) },
              { label: "University / college", value: s.universityName },
              { label: "PRN / enrollment no.", value: s.prn ? <span className="font-mono">{s.prn}</span> : "—" },
              { label: "Height / weight", value: s.measurements[0] ? <span className="font-mono">{s.measurements[0].heightCm} cm · {s.measurements[0].weightKg} kg</span> : "Measured at the desk" },
              { label: "Sports ID", value: s.sportsId ? <span className="font-mono">{s.sportsId}</span> : "Issued on approval" },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your data" />
        <CardBody className="space-y-3">
          <p className="text-muted">
            You can ask us to delete your registration and documents at any time. Read the <Link href="/privacy" className="font-semibold text-fg underline underline-offset-4">privacy notice</Link> for details.
          </p>
          {s.deletionRequests.length > 0 ? (
            <Alert tone="warning" title="Deletion requested">
              Requested on {formatDateTime(s.deletionRequests[0].createdAt)}. The sports office will complete it shortly.
            </Alert>
          ) : (
            <DeletionRequestButton />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
