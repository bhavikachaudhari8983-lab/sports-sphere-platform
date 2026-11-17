import type { Document, Registration, Student, VerificationCheck } from "@prisma/client";
import { prisma } from "./prisma";
import { audit, type Actor } from "./audit";
import { ApiError } from "./api";
import { academicSchema, personalSchema } from "./validation/registration";
import { validateRegistrations } from "./eligibility";
import { getAgeCategory } from "./registration";
import { isMinor } from "./age";
import { CHECK_LABEL, type CheckType, type DocType } from "./constants";
import { formatDob, normaliseName } from "./utils";
import { messages, notifyStudent } from "./notifications";

type Full = Student & { documents: Document[]; registrations: Registration[]; checks: VerificationCheck[] };

/** Server-side validation of the complete registration. Keys are "<section>.<field>". */
export async function validateSubmission(s: Full): Promise<Record<string, string>> {
  const errors: Record<string, string> = {};
  const has = (t: DocType) => s.documents.some((d) => d.type === t);

  // Manual-route identities get their identity key only after the desk check, so they're allowed through here
  // without one; they can't be VERIFIED until an official has checked the original ID (see verificationBlockers).
  const identityReady = s.dobLocked && !!s.dob && (!!s.identityKey || (s.dobSource === "MANUAL" && s.documents.some((d) => d.type === "ID_PROOF")));
  if (!identityReady) errors["identity.verified"] = "Verify your identity first";
  if (s.studentType === "INTERNATIONAL") {
    if (!has("PASSPORT")) errors["identity.PASSPORT"] = "Upload your passport photo page";
    if (!has("VISA")) errors["identity.VISA"] = "Upload your student visa";
    if (!has("FRRO")) errors["identity.FRRO"] = "Upload your FRRO residence permit";
  }
  if (!has("SELFIE")) errors["selfie.SELFIE"] = "Take a live selfie";

  const personal = personalSchema.safeParse({
    mobile: s.mobile ?? undefined,
    email: s.email ?? undefined,
    address: s.address ?? undefined,
    bloodGroup: s.bloodGroup ?? undefined,
    emergencyName: s.emergencyName ?? undefined,
    emergencyPhone: s.emergencyPhone ?? undefined,
  });
  if (!personal.success) for (const i of personal.error.issues) errors[`personal.${i.path.join(".")}`] ??= `Personal: ${i.message}`;
  if (!has("PHOTO")) errors["personal.PHOTO"] = "Upload a passport-size photo";

  const academic = academicSchema.safeParse({
    universityName: s.universityName ?? undefined,
    prn: s.prn ?? undefined,
    course: s.course ?? undefined,
    year: s.year ?? undefined,
    apaarId: s.apaarId ?? undefined,
    collegeOfficeEmail: s.collegeOfficeEmail ?? undefined,
  });
  if (!academic.success) for (const i of academic.error.issues) errors[`academic.${i.path.join(".")}`] ??= `Academic: ${i.message}`;
  if (s.studentType === "OUTSIDE_INDIAN") {
    if (!s.collegeOfficeEmail) errors["academic.collegeOfficeEmail"] = "Enter your college office email";
    if (!has("COLLEGE_ID")) errors["academic.COLLEGE_ID"] = "Upload your college ID card";
    if (!has("BONAFIDE")) errors["academic.BONAFIDE"] = "Upload your bonafide letter";
  }

  if (s.registrations.length === 0) errors["sports.registrations"] = "Choose at least one event";
  else {
    const { errors: regErrors } = await validateRegistrations(s.registrations, { studentId: s.id, gender: s.gender, dob: s.dob }, { requireWeight: true });
    for (const msg of Object.values(regErrors)) errors[`sports.${Object.keys(errors).length}`] = msg;
  }

  if (!has("MEDICAL_CERT")) errors["medical.MEDICAL_CERT"] = "Upload your medical fitness certificate";
  if (isMinor(s.dob) && !has("GUARDIAN_CONSENT")) errors["medical.GUARDIAN_CONSENT"] = "Parent/guardian consent is required for athletes under 18";
  if (!s.declarationAccepted) errors["medical.declarationAccepted"] = "Accept the declaration";
  if (!s.privacyAccepted) errors["medical.privacyAccepted"] = "Accept the privacy notice";

  const { ageCategory } = await getAgeCategory(s.dob);
  if (s.dob && !ageCategory) errors["identity.age"] = "No age category is configured for your age — contact the sports office";
  return errors;
}

/** Human-readable reason shown to the student when auto-checks fail. */
export function flagReasonFrom(checks: VerificationCheck[]): string | null {
  const failed = checks.filter((c) => !c.passed);
  if (!failed.length) return null;
  return (
    failed
      .map((c) => {
        // Never show the student another profile's details.
        if (c.type === "SAME_PERSON_OTHER_DOB") return "Another registration with your name and Aadhaar digits has a different date of birth";
        const label = CHECK_LABEL[c.type as CheckType] ?? c.type;
        const fmt = (v: string | null) => (c.type.includes("DOB") ? formatDob(v) : v ?? "—");
        return `${label} — record: ${fmt(c.expected)}, verified source: ${fmt(c.actual)}`;
      })
      .join(". ") + ". Please visit the sports office with your original documents."
  );
}

export async function submitRegistration(studentId: string, actor: Actor, ip: string | null) {
  const s = await prisma.student.findUnique({ where: { id: studentId }, include: { documents: true, registrations: true, checks: true } });
  if (!s) throw new ApiError(404, "Registration not found");
  if (s.status !== "DRAFT") throw new ApiError(409, "This registration has already been submitted.");

  const errors = await validateSubmission(s);
  if (Object.keys(errors).length) throw new ApiError(400, "Some required information is missing.", errors);

  // One person = one profile (the unique index also enforces this).
  // (Skipped while the key is still empty, i.e. a manual identity awaiting its desk check: "identityKey: null" would
  // otherwise match every other key-less registration.)
  if (s.identityKey) {
    const dup = await prisma.student.findFirst({ where: { identityKey: s.identityKey, NOT: { id: s.id } }, select: { id: true } });
    if (dup) throw new ApiError(409, "A registration already exists for this person.");
  }

  // Outside students: link to a college record; untrusted colleges need admin confirmation.
  let collegeId = s.collegeId;
  if (s.studentType === "OUTSIDE_INDIAN" && s.universityName) {
    const normalizedName = normaliseName(s.universityName);
    const college = await prisma.college.upsert({
      where: { normalizedName },
      update: {},
      create: { name: s.universityName.trim(), normalizedName, officeEmail: s.collegeOfficeEmail },
    });
    collegeId = college.id;
  }

  // Fake-age signal: the same person (same name + Aadhaar last 4 + gender) already registered with a DIFFERENT DOB,
  // e.g. through a second DigiLocker account or an earlier year's profile. Flag both for the sports office.
  const checks = [...s.checks];
  if (s.aadhaarLast4 && s.fullName && s.dob) {
    const name = normaliseName(s.fullName);
    const others = (
      await prisma.student.findMany({ where: { aadhaarLast4: s.aadhaarLast4, gender: s.gender, status: { not: "DRAFT" }, NOT: { id: s.id } }, select: { id: true, fullName: true, dob: true, sportsId: true, prn: true } })
    ).filter((o) => o.fullName && normaliseName(o.fullName) === name && o.dob && o.dob !== s.dob);
    if (others.length) {
      const o = others[0];
      checks.push(
        await prisma.verificationCheck.create({
          data: { studentId: s.id, type: "SAME_PERSON_OTHER_DOB", passed: false, expected: o.dob, actual: s.dob, details: `Matches profile ${o.sportsId ?? o.prn ?? o.id}. Check original documents before approving either.` },
        }),
      );
      for (const other of others) {
        await audit({ actor: { type: "SYSTEM" }, action: "VERIFICATION_MISMATCH", studentId: other.id, summary: `Possible fake age: a new registration with the same name and Aadhaar digits has DOB ${s.dob} (this profile: ${other.dob})`, ip });
      }
    }
  }

  const reason = flagReasonFrom(checks);
  const status = reason ? "FLAGGED" : "PENDING";
  await prisma.student.update({
    where: { id: s.id },
    data: { status, statusReason: reason, submittedAt: new Date(), collegeId, wizardStep: 6 },
  });
  await audit({ actor, action: "REGISTRATION_SUBMITTED", studentId: s.id, summary: `Registration submitted (${s.registrations.length} event${s.registrations.length === 1 ? "" : "s"})`, ip });
  await audit({ actor: { type: "SYSTEM" }, action: "STATUS_CHANGED", studentId: s.id, summary: `Status DRAFT → ${status}${reason ? " (auto-check mismatch)" : ""}`, details: reason ? { reason } : undefined, ip });
  await notifyStudent(s.id, "REGISTRATION_SUBMITTED", reason ? messages.submittedFlagged(s.id, reason) : messages.submitted(s.id));
  return status;
}
