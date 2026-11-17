// Status transitions. All staff actions go through here so rules and audit entries are consistent.
import { prisma } from "./prisma";
import { audit, type Actor } from "./audit";
import { ApiError } from "./api";
import { generateSportsId } from "./qr";
import { indianIdentityKey } from "./identity";
import type { Status } from "./constants";
import { getAgeCategory } from "./registration";
import { eventIneligibility } from "./eligibility";
import { messages, notifyStudent } from "./notifications";

async function load(id: string) {
  const s = await prisma.student.findUnique({ where: { id }, include: { college: true, measurements: { take: 1 } } });
  if (!s) throw new ApiError(404, "Student not found");
  return s;
}

async function setStatus(id: string, from: string, to: Status, actor: Actor, reason: string | null, extra: Record<string, unknown> = {}, ip?: string | null) {
  await prisma.student.update({ where: { id }, data: { status: to, statusReason: reason, ...extra } });
  await audit({ actor, action: "STATUS_CHANGED", studentId: id, summary: `Status ${from} → ${to}${reason ? `: ${reason}` : ""}`, details: reason ? { reason } : undefined, ip });
}

/** Requirements an official must meet before marking someone VERIFIED (also shown in the UI). */
export function verificationBlockers(s: Awaited<ReturnType<typeof load>>): string[] {
  const out: string[] = [];
  if (s.status !== "PENDING") out.push(s.status === "FLAGGED" ? "Flag must be resolved by an admin first" : `Status is ${s.status}, expected PENDING`);
  if (!s.measurements.length) out.push("Record height and weight");
  if (s.studentType === "OUTSIDE_INDIAN" && !s.college?.trusted) out.push("College not yet confirmed by an admin");
  if (s.studentType === "INTERNATIONAL" && !s.passportDeskVerified) out.push("Tick “Passport chip/MRZ verified”");
  if (s.dobSource === "MANUAL" && !s.identityDocDeskVerified) out.push("Check the original Government ID and tick “ID document verified”");
  return out;
}

export async function markVerified(id: string, actor: Actor & { type: "STAFF" }, ip: string | null) {
  const s = await load(id);
  const blockers = verificationBlockers(s);
  if (blockers.length) throw new ApiError(409, `Cannot verify yet: ${blockers.join("; ")}.`);
  await setStatus(id, s.status, "VERIFIED", actor, null, { verifiedAt: new Date(), verifiedById: actor.id }, ip);
}

export async function approve(id: string, actor: Actor & { type: "STAFF" }, ip: string | null) {
  const s = await load(id);
  if (s.status !== "VERIFIED") throw new ApiError(409, "Only VERIFIED registrations can be approved. An official must verify at the desk first.");
  if (s.studentType === "OUTSIDE_INDIAN" && !s.college?.trusted) throw new ApiError(409, "Confirm the college first.");
  const sportsId = s.sportsId ?? (await uniqueSportsId());
  await setStatus(id, s.status, "APPROVED", actor, null, { approvedAt: new Date(), approvedById: actor.id, sportsId }, ip);
  await audit({ actor, action: "QR_ISSUED", studentId: id, summary: `QR Sports ID ${sportsId} issued`, ip });
  await notifyStudent(id, "REGISTRATION_APPROVED", messages.approved(sportsId));
  return sportsId;
}

async function uniqueSportsId(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const id = generateSportsId();
    if (!(await prisma.student.findUnique({ where: { sportsId: id }, select: { id: true } }))) return id;
  }
  throw new Error("Could not allocate a Sports ID");
}

export async function reject(id: string, reason: string, actor: Actor, ip: string | null) {
  const s = await load(id);
  if (s.status === "DRAFT") throw new ApiError(409, "Draft registrations can't be rejected.");
  if (s.status === "REJECTED") throw new ApiError(409, "Already rejected.");
  await setStatus(id, s.status, "REJECTED", actor, reason, {}, ip);
  await notifyStudent(id, "REGISTRATION_REJECTED", messages.rejected(reason));
}

export async function flag(id: string, reason: string, actor: Actor, ip: string | null) {
  const s = await load(id);
  if (s.status === "DRAFT") throw new ApiError(409, "Draft registrations can't be flagged.");
  await setStatus(id, s.status, "FLAGGED", actor, reason, {}, ip);
  await notifyStudent(id, "REGISTRATION_FLAGGED", messages.flagged(reason));
}

/** Resolve a flag / reopen a rejection → back to PENDING for desk verification. */
export async function reopen(id: string, reason: string, actor: Actor, ip: string | null) {
  const s = await load(id);
  if (s.status !== "FLAGGED" && s.status !== "REJECTED") throw new ApiError(409, "Only flagged or rejected registrations can be moved back to pending.");
  await setStatus(id, s.status, "PENDING", actor, null, { verifiedAt: null, verifiedById: null }, ip);
  await audit({ actor, action: "STATUS_CHANGED", studentId: id, summary: `Flag resolved / reopened: ${reason}` , ip });
}

export async function confirmCollege(id: string, actor: Actor & { type: "STAFF" }, ip: string | null) {
  const s = await load(id);
  if (s.studentType !== "OUTSIDE_INDIAN" || !s.college) throw new ApiError(400, "This student has no outside college to confirm.");
  if (s.college.trusted) throw new ApiError(409, "College is already confirmed.");
  await prisma.college.update({ where: { id: s.college.id }, data: { trusted: true, confirmedById: actor.id, confirmedAt: new Date() } });
  await audit({ actor, action: "COLLEGE_CONFIRMED", studentId: id, entityType: "College", entityId: s.college.id, summary: `College confirmed and saved as trusted: ${s.college.name}`, ip });
}

/**
 * Rejects a staff action if the record changed since the admin opened it (someone else acted first).
 * `version` is the student's updatedAt as the admin saw it.
 */
export async function assertUnchanged(id: string, version: string | undefined) {
  if (!version) return;
  const s = await prisma.student.findUnique({ where: { id }, select: { updatedAt: true } });
  if (!s) throw new ApiError(404, "Student not found");
  if (s.updatedAt.toISOString() === version) return;
  const last = await prisma.auditLog.findFirst({ where: { studentId: id, actorType: "STAFF" }, orderBy: { createdAt: "desc" }, select: { actorName: true, summary: true } });
  throw new ApiError(409, `This record was changed while you were viewing it${last ? ` (${last.actorName}: ${last.summary})` : ""}. Refresh the page and check before acting.`);
}

/** Approves many VERIFIED students in one go. Each one is checked and audited individually. */
export async function bulkApprove(ids: string[], actor: Actor & { type: "STAFF" }, ip: string | null) {
  const approved: Array<{ id: string; sportsId: string }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const id of ids) {
    try {
      const s = await prisma.student.findUnique({ where: { id }, select: { checks: { where: { passed: false }, select: { id: true } }, ageConcerns: { where: { status: "OPEN" }, select: { id: true } } } });
      if (s?.checks.length) throw new ApiError(409, "has failed automatic checks — review individually");
      if (s?.ageConcerns.length) throw new ApiError(409, "has an open age concern — review individually");
      approved.push({ id, sportsId: await approve(id, actor, ip) });
    } catch (e) {
      skipped.push({ id, reason: e instanceof Error ? e.message : "failed" });
    }
  }
  return { approved, skipped };
}

/** What a DOB change would do: the new age category and any events the athlete would no longer be eligible for. */
export async function dobImpact(id: string, newDob: string) {
  const s = await prisma.student.findUnique({ where: { id }, select: { gender: true, registrations: { include: { event: { include: { ageCategory: true } } } } } });
  if (!s) throw new ApiError(404, "Student not found");
  const [{ ageCategory, cutoff }, before] = await Promise.all([getAgeCategory(newDob), prisma.student.findUnique({ where: { id }, select: { dob: true } })]);
  const fromCategory = (await getAgeCategory(before?.dob ?? null)).ageCategory;
  const ineligible = s.registrations
    .map((r) => ({ registrationId: r.id, event: r.event.name, why: eventIneligibility(r.event, { gender: s.gender, dob: newDob, cutoff }) }))
    .filter((r): r is { registrationId: string; event: string; why: string } => !!r.why);
  return { fromCategory, toCategory: ageCategory, ineligible };
}

/** Step 1 (maker): an admin proposes a corrected DOB. Nothing changes until a different admin approves it. */
export async function requestDobChange(id: string, newDob: string, reason: string, actor: Actor & { type: "STAFF" }, ip: string | null) {
  const s = await load(id);
  if (!s.dob) throw new ApiError(409, "Identity has not been verified yet.");
  if (s.dob === newDob) throw new ApiError(400, "The new date of birth is the same as the current one.");
  if (await prisma.dobCorrection.findFirst({ where: { studentId: id, status: "PENDING" }, select: { id: true } })) throw new ApiError(409, "A DOB correction is already waiting for approval.");
  const c = await prisma.dobCorrection.create({ data: { studentId: id, fromDob: s.dob, toDob: newDob, reason, requestedById: actor.id, requestedByName: actor.name } });
  await audit({ actor, action: "DOB_CHANGE_REQUESTED", studentId: id, entityType: "DobCorrection", entityId: c.id, summary: `DOB correction proposed ${s.dob} → ${newDob}, awaiting a second admin. Reason: ${reason}`, details: { from: s.dob, to: newDob, reason }, ip });
}

/** Step 2 (checker): a DIFFERENT admin approves or declines. Approval applies the DOB and re-checks event eligibility. */
export async function decideDobChange(correctionId: string, approveIt: boolean, note: string, actor: Actor & { type: "STAFF" }, ip: string | null) {
  const c = await prisma.dobCorrection.findUnique({ where: { id: correctionId } });
  if (!c || c.status !== "PENDING") throw new ApiError(404, "This correction is no longer pending.");
  if (c.requestedById === actor.id) throw new ApiError(403, "A second admin must approve this. You can't approve your own DOB correction.");
  const decided = { decidedById: actor.id, decidedByName: actor.name, decisionNote: note, decidedAt: new Date() };
  if (!approveIt) {
    await prisma.dobCorrection.update({ where: { id: c.id }, data: { status: "DECLINED", ...decided } });
    await audit({ actor, action: "DOB_CHANGE_DECLINED", studentId: c.studentId, entityType: "DobCorrection", entityId: c.id, summary: `DOB correction ${c.fromDob} → ${c.toDob} declined: ${note}`, ip });
    return { flagged: false };
  }

  const s = await load(c.studentId);
  if (s.dob !== c.fromDob) throw new ApiError(409, "The DOB changed after this correction was proposed. Decline it and propose a new one.");
  let identityKey = s.identityKey;
  if (s.studentType !== "INTERNATIONAL" && s.aadhaarLast4 && s.fullName) {
    identityKey = indianIdentityKey(s.aadhaarLast4, s.fullName, c.toDob);
    const clash = await prisma.student.findFirst({ where: { identityKey, NOT: { id: s.id } }, select: { id: true } });
    if (clash) throw new ApiError(409, "Another profile already has this identity. Investigate before changing the DOB.");
  }
  const impact = await dobImpact(s.id, c.toDob);
  await prisma.student.update({ where: { id: s.id }, data: { dob: c.toDob, dobSource: "ADMIN_CORRECTION", dobLocked: true, identityKey } });
  await prisma.dobCorrection.update({ where: { id: c.id }, data: { status: "APPLIED", ...decided } });
  await audit({
    actor,
    action: "DOB_CHANGED",
    studentId: s.id,
    summary: `DOB changed ${c.fromDob} → ${c.toDob} (proposed by ${c.requestedByName}, approved by ${actor.name}). Reason: ${c.reason}`,
    details: { from: c.fromDob, to: c.toDob, reason: c.reason, requestedBy: c.requestedByName, note, ageCategory: { from: impact.fromCategory, to: impact.toCategory } },
    ip,
  });

  // Entered events the new age no longer allows → back to FLAGGED so the student picks an eligible one.
  const flagged = impact.ineligible.length > 0 && s.status !== "DRAFT" && s.status !== "REJECTED";
  if (flagged) {
    const reason = `Your date of birth was corrected, so your age category is now ${impact.toCategory ?? "—"}. You are no longer eligible for ${impact.ineligible.map((i) => i.event).join(", ")}. Withdraw from it on this page or ask the sports office to move you to an eligible event.`;
    await setStatus(s.id, s.status, "FLAGGED", { type: "SYSTEM" }, reason, { verifiedAt: null, verifiedById: null }, ip);
  }
  return { flagged };
}
