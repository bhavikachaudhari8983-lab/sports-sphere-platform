// Shared enumerations. Stored as strings in the DB so the schema stays portable (SQLite ⇄ PostgreSQL).

export const APP_NAME = "Sports Sphere";
/** Prefix printed on Sports IDs, e.g. SS-26-4F7K2Q */
export const ID_PREFIX = "SS";
/** The university hosting the games. Stored on host-university students' records; set NEXT_PUBLIC_UNIVERSITY_NAME to brand it. */
export const UNIVERSITY_NAME = process.env.NEXT_PUBLIC_UNIVERSITY_NAME ?? "Host University";
export const CONTACT_EMAIL = "sports.office@sportssphere.example";
export const CONTACT_PHONE = "+91 20 5550 0100";

export const STATUSES = ["DRAFT", "PENDING", "VERIFIED", "APPROVED", "FLAGGED", "REJECTED"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Draft",
  PENDING: "Pending",
  VERIFIED: "Verified",
  APPROVED: "Approved",
  FLAGGED: "Flagged",
  REJECTED: "Rejected",
};

export const STUDENT_TYPES = ["OUR_INDIAN", "OUTSIDE_INDIAN", "INTERNATIONAL"] as const;
export type StudentType = (typeof STUDENT_TYPES)[number];

export const STUDENT_TYPE_LABEL: Record<StudentType, string> = {
  OUR_INDIAN: "Host university student (Indian)",
  OUTSIDE_INDIAN: "Other university (Indian)",
  INTERNATIONAL: "International / OCI / NRI",
};

export const ROLES = ["STUDENT", "OFFICIAL", "ADMIN", "SUPER_ADMIN", "MEDICAL", "COACH"] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES = ["OFFICIAL", "ADMIN", "SUPER_ADMIN", "MEDICAL", "COACH"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * True if `role` may do something allowed for `allowed`. A Super Admin can do everything an Admin can (and,
 * separately, manage admin accounts). Use this everywhere instead of `allowed.includes(role)`.
 */
export function roleSatisfies(role: string | null | undefined, allowed: readonly string[]): boolean {
  if (!role) return false;
  return allowed.includes(role) || (role === "SUPER_ADMIN" && allowed.includes("ADMIN"));
}
/** Roles only a Super Admin may create, change or deactivate. */
export const ADMIN_ROLES: readonly StaffRole[] = ["ADMIN", "SUPER_ADMIN"];

export const ROLE_LABEL: Record<Role, string> = {
  STUDENT: "Student",
  OFFICIAL: "Official",
  ADMIN: "Admin",
  SUPER_ADMIN: "Super admin",
  MEDICAL: "Medical",
  COACH: "Coach",
};

export const DOC_TYPES = [
  "PHOTO",
  "SELFIE",
  "REFERENCE_PHOTO",
  "CLASS10",
  "COLLEGE_ID",
  "BONAFIDE",
  "PASSPORT",
  "VISA",
  "FRRO",
  "MEDICAL_CERT",
  "GUARDIAN_CONSENT",
  "ACHIEVEMENT",
  "ID_PROOF",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_LABEL: Record<DocType, string> = {
  PHOTO: "Passport-size photo",
  SELFIE: "Live selfie",
  REFERENCE_PHOTO: "Verified source photo",
  CLASS10: "Class 10 certificate",
  COLLEGE_ID: "College ID card",
  BONAFIDE: "Bonafide letter",
  PASSPORT: "Passport photo page",
  VISA: "Student visa",
  FRRO: "FRRO residence permit",
  MEDICAL_CERT: "Medical fitness certificate",
  GUARDIAN_CONSENT: "Parent/guardian consent",
  ACHIEVEMENT: "Achievement certificate",
  ID_PROOF: "Government photo ID",
};

/** Documents a student may upload themselves (others come from verified sources). */
export const STUDENT_UPLOADABLE: readonly DocType[] = [
  "PHOTO",
  "SELFIE",
  "COLLEGE_ID",
  "BONAFIDE",
  "PASSPORT",
  "VISA",
  "FRRO",
  "MEDICAL_CERT",
  "GUARDIAN_CONSENT",
  "ACHIEVEMENT",
  "ID_PROOF",
];

/** Which staff roles may view which document types. Students may always view their own. */
export const DOC_ACCESS: Record<DocType, readonly StaffRole[]> = {
  PHOTO: ["ADMIN", "OFFICIAL", "MEDICAL", "COACH"],
  SELFIE: ["ADMIN", "OFFICIAL"],
  REFERENCE_PHOTO: ["ADMIN", "OFFICIAL"],
  CLASS10: ["ADMIN", "OFFICIAL"],
  COLLEGE_ID: ["ADMIN", "OFFICIAL"],
  BONAFIDE: ["ADMIN", "OFFICIAL"],
  PASSPORT: ["ADMIN", "OFFICIAL"],
  VISA: ["ADMIN", "OFFICIAL"],
  FRRO: ["ADMIN", "OFFICIAL"],
  MEDICAL_CERT: ["ADMIN", "MEDICAL"],
  GUARDIAN_CONSENT: ["ADMIN", "MEDICAL"],
  ACHIEVEMENT: ["ADMIN", "OFFICIAL", "COACH"],
  ID_PROOF: ["ADMIN", "OFFICIAL"],
};

export const DOC_SOURCES = ["UPLOAD", "CAMERA", "DIGILOCKER", "AADHAAR_OFFLINE", "ERP", "PASSPORT", "SEED"] as const;
export type DocSource = (typeof DOC_SOURCES)[number];

export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const UPLOAD_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

export const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABEL: Record<Gender, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export const EVENT_GENDERS = ["MALE", "FEMALE", "MIXED"] as const;
export type EventGender = (typeof EVENT_GENDERS)[number];

export const CHECK_TYPES = [
  "ERP_NAME_MATCH",
  "ERP_DOB_MATCH",
  "ADMISSIONS_DOB_MATCH",
  "ADMISSIONS_NAME_MATCH",
  "MRZ_CHECK",
  "DUPLICATE",
  "SAME_PERSON_OTHER_DOB",
] as const;
export type CheckType = (typeof CHECK_TYPES)[number];

export const CHECK_LABEL: Record<CheckType, string> = {
  ERP_NAME_MATCH: "Name: ERP vs DigiLocker",
  ERP_DOB_MATCH: "Date of birth: ERP vs DigiLocker",
  ADMISSIONS_DOB_MATCH: "Date of birth: passport vs admissions record",
  ADMISSIONS_NAME_MATCH: "Name: passport vs admissions record",
  MRZ_CHECK: "Passport MRZ check digits",
  DUPLICATE: "Duplicate identity check",
  SAME_PERSON_OTHER_DOB: "Same name & Aadhaar digits on another profile with a different DOB",
};

export const DOB_SOURCES = ["DIGILOCKER", "AADHAAR_OFFLINE", "MANUAL", "PASSPORT", "ADMIN_CORRECTION"] as const;
export type DobSource = (typeof DOB_SOURCES)[number];
/** How the date of birth was verified, in plain words (student, desk and admin screens). */
export const DOB_SOURCE_LABEL: Record<DobSource, string> = {
  DIGILOCKER: "DigiLocker",
  AADHAAR_OFFLINE: "Aadhaar Offline e-KYC",
  MANUAL: "Government ID, checked at the desk",
  PASSPORT: "Passport (MRZ check)",
  ADMIN_CORRECTION: "Admin correction",
};

/** Government photo IDs accepted on the manual identity route. */
export const ID_DOC_TYPES = ["AADHAAR_CARD", "PASSPORT", "PAN", "DRIVING_LICENCE", "VOTER_ID"] as const;
export type IdDocType = (typeof ID_DOC_TYPES)[number];
export const ID_DOC_LABEL: Record<IdDocType, string> = {
  AADHAAR_CARD: "Aadhaar card",
  PASSPORT: "Indian passport",
  PAN: "PAN card",
  DRIVING_LICENCE: "Driving licence",
  VOTER_ID: "Voter ID",
};

export const AUDIT_ACTIONS = [
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "OTP_SENT",
  "REGISTRATION_STARTED",
  "IDENTITY_VERIFIED",
  "VERIFICATION_MISMATCH",
  "DUPLICATE_BLOCKED",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_DELETED",
  "DOCUMENT_VIEWED",
  "REGISTRATION_SUBMITTED",
  "STATUS_CHANGED",
  "DOB_CHANGED",
  "DOB_CHANGE_REQUESTED",
  "DOB_CHANGE_DECLINED",
  "AGE_CONCERN_RAISED",
  "AGE_CONCERN_RESOLVED",
  "EVENT_WITHDRAWN",
  "EVENT_CHANGE_REQUESTED",
  "EVENT_CHANGE_DECIDED",
  "COMPETITION_CHANGED",
  "TEAM_CHANGED",
  "FIXTURES_GENERATED",
  "MATCH_SCORED",
  "RESULTS_FINALISED",
  "CERTIFICATE_ISSUED",
  "CERTIFICATE_REVOKED",
  "CERTIFICATE_VERIFIED",
  "ANNOUNCEMENT_SENT",
  "MEASUREMENT_RECORDED",
  "WEIGH_IN_RECORDED",
  "PASSPORT_VERIFIED",
  "IDENTITY_SUBMITTED",
  "TOURNAMENT_CHANGED",
  "NOTIFICATION_SENT",
  "ID_DOCUMENT_VERIFIED",
  "COLLEGE_CONFIRMED",
  "QR_ISSUED",
  "QR_SCANNED",
  "SETTINGS_CHANGED",
  "STAFF_CHANGED",
  "DELETION_REQUESTED",
  "DELETION_COMPLETED",
  "DELETION_DECLINED",
  "DATA_EXPORTED",
  "RETENTION_PURGE",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const WIZARD_STEPS = [
  { id: "identity", label: "Identity" },
  { id: "selfie", label: "Selfie" },
  { id: "personal", label: "Personal" },
  { id: "academic", label: "Academic" },
  { id: "sports", label: "Sports" },
  { id: "medical", label: "Medical & consent" },
  { id: "review", label: "Review" },
] as const;
export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

export function isStatus(v: string): v is Status {
  return (STATUSES as readonly string[]).includes(v);
}
export function isStudentType(v: string): v is StudentType {
  return (STUDENT_TYPES as readonly string[]).includes(v);
}
export function isDocType(v: string): v is DocType {
  return (DOC_TYPES as readonly string[]).includes(v);
}
export function isStaffRole(v: string): v is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(v);
}

export const FORMATS = ["LEAGUE", "KNOCKOUT", "RACE"] as const;
export type Format = (typeof FORMATS)[number];
export const FORMAT_LABEL: Record<Format, string> = {
  LEAGUE: "League (everyone plays everyone)",
  KNOCKOUT: "Knockout (bracket)",
  RACE: "Ranked results (times, distances, scores)",
};

export const MATCH_STATUSES = ["SCHEDULED", "LIVE", "COMPLETED", "WALKOVER"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const CERT_KINDS = ["PARTICIPATION", "GOLD", "SILVER", "BRONZE"] as const;
export type CertKind = (typeof CERT_KINDS)[number];
export const CERT_LABEL: Record<CertKind, string> = { PARTICIPATION: "Certificate of Participation", GOLD: "Gold Medal", SILVER: "Silver Medal", BRONZE: "Bronze Medal" };
export const MEDAL_FOR_POSITION: Record<number, CertKind> = { 1: "GOLD", 2: "SILVER", 3: "BRONZE" };

export const AUDIENCES = ["EVERYONE", "ATHLETES", "EVENT", "CAPTAINS", "OFFICIALS", "COACHES", "MEDICAL"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABEL: Record<Audience, string> = {
  EVERYONE: "Everyone (athletes and staff)",
  ATHLETES: "All approved athletes",
  EVENT: "Athletes in one event",
  CAPTAINS: "Team captains",
  OFFICIALS: "Officials",
  COACHES: "Coaches",
  MEDICAL: "Medical staff",
};
