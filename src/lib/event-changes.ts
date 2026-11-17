// After submitting, a student can withdraw from an event straight away, or ask to swap one event for another.
// Swaps need an admin because they can affect squads, entry limits and age eligibility.
import { prisma } from "./prisma";
import { audit, type Actor } from "./audit";
import { ApiError } from "./api";
import { validateRegistrations } from "./eligibility";

const LOCKED = ["DRAFT", "REJECTED"];

export async function withdrawFromEvent(studentId: string, eventId: string, reason: string, actor: Actor, ip: string | null) {
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { status: true, registrations: { include: { event: true } } } });
  if (!s || LOCKED.includes(s.status)) throw new ApiError(409, "You can only withdraw after submitting your registration.");
  const reg = s.registrations.find((r) => r.eventId === eventId);
  if (!reg) throw new ApiError(404, "You are not entered in this event.");
  if (s.registrations.length === 1) throw new ApiError(409, "This is your only event. To cancel your whole registration, contact the sports office or request deletion below.");
  await prisma.$transaction([
    prisma.registration.delete({ where: { id: reg.id } }),
    prisma.eventChangeRequest.updateMany({ where: { studentId, fromEventId: eventId, status: "PENDING" }, data: { status: "DECLINED", decisionNote: "Withdrawn by the student", decidedAt: new Date() } }),
  ]);
  await audit({ actor, action: "EVENT_WITHDRAWN", studentId, entityType: "Event", entityId: eventId, summary: `Withdrew from ${reg.event.name}: ${reason}`, ip });
}

export async function requestEventChange(studentId: string, input: { fromEventId: string; toEventId: string; weightCategoryId: string | null; reason: string }, actor: Actor, ip: string | null) {
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, status: true, gender: true, dob: true, registrations: { select: { eventId: true } } } });
  if (!s || LOCKED.includes(s.status)) throw new ApiError(409, "You can only request a change after submitting your registration.");
  if (!s.registrations.some((r) => r.eventId === input.fromEventId)) throw new ApiError(404, "You are not entered in that event.");
  if (s.registrations.some((r) => r.eventId === input.toEventId)) throw new ApiError(409, "You are already entered in the new event.");
  if (await prisma.eventChangeRequest.findFirst({ where: { studentId, status: "PENDING" }, select: { id: true } })) throw new ApiError(409, "You already have a change request waiting. Wait for the sports office to answer it.");
  const { errors } = await validateRegistrations([{ eventId: input.toEventId, weightCategoryId: input.weightCategoryId }], { studentId, gender: s.gender, dob: s.dob }, { requireWeight: true });
  const err = Object.values(errors)[0];
  if (err) throw new ApiError(400, err, { toEventId: err });
  const r = await prisma.eventChangeRequest.create({ data: { studentId, ...input }, include: { fromEvent: true, toEvent: true } });
  await audit({ actor, action: "EVENT_CHANGE_REQUESTED", studentId, entityType: "EventChangeRequest", entityId: r.id, summary: `Asked to move from ${r.fromEvent.name} to ${r.toEvent.name}: ${input.reason}`, ip });
}

export async function decideEventChange(studentId: string, requestId: string, approveIt: boolean, note: string, actor: Actor & { type: "STAFF" }, ip: string | null) {
  const r = await prisma.eventChangeRequest.findUnique({ where: { id: requestId }, include: { fromEvent: true, toEvent: true } });
  if (!r || r.studentId !== studentId || r.status !== "PENDING") throw new ApiError(404, "This request is no longer pending.");
  const decided = { decidedById: actor.id, decidedByName: actor.name, decisionNote: note, decidedAt: new Date() };
  if (approveIt) {
    // Re-check now: the event may have filled up, or the DOB may have been corrected, since the student asked.
    const s = await prisma.student.findUnique({ where: { id: studentId }, select: { gender: true, dob: true } });
    // The deadline isn't re-checked here: the student asked while registration was open.
    const { errors } = await validateRegistrations([{ eventId: r.toEventId, weightCategoryId: r.weightCategoryId }], { studentId, gender: s?.gender ?? null, dob: s?.dob ?? null }, { requireWeight: true, checkWindow: false });
    const err = Object.values(errors)[0];
    if (err) throw new ApiError(409, `Can't approve: ${err}. Decline the request instead.`);
    await prisma.$transaction([
      prisma.registration.deleteMany({ where: { studentId, eventId: r.fromEventId } }),
      prisma.registration.create({ data: { studentId, eventId: r.toEventId, weightCategoryId: r.weightCategoryId } }),
      prisma.eventChangeRequest.update({ where: { id: r.id }, data: { status: "APPROVED", ...decided } }),
    ]);
  } else {
    await prisma.eventChangeRequest.update({ where: { id: r.id }, data: { status: "DECLINED", ...decided } });
  }
  await audit({ actor, action: "EVENT_CHANGE_DECIDED", studentId, entityType: "EventChangeRequest", entityId: r.id, summary: `Event change ${r.fromEvent.name} → ${r.toEvent.name} ${approveIt ? "approved" : "declined"}: ${note}`, ip });
}
