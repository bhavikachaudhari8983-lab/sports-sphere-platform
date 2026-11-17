// Client-safe types shared by the wizard and the API (no server imports here).
import type { DocType, Status, StudentType } from "./constants";

export type DraftDoc = {
  id: string;
  type: DocType;
  source: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

export type DraftCheck = {
  type: string;
  passed: boolean;
  expected: string | null;
  actual: string | null;
  details: string | null;
};

export type CatalogSport = {
  id: string;
  name: string;
  isWeightCategory: boolean;
  positions: string[];
  events: Array<{ id: string; name: string; gender: string; eventDate: string | null; venue: string | null; ageLimit: { name: string; maxAge: number | null } | null; tournament: string | null; closedReason: string | null }>;
  weightCategories: Array<{ id: string; name: string; gender: string; minKg: number | null; maxKg: number | null }>;
};

export type RegistrationDraft = {
  id: string;
  status: Status;
  studentType: StudentType;
  isOurUniversity: boolean;
  wizardStep: number;
  statusReason: string | null;
  submittedAt: string | null;
  identity: {
    verified: boolean;
    fullName: string | null;
    dob: string | null;
    dobSource: string | null;
    gender: string | null;
    aadhaarLast4: string | null;
    passportNumber: string | null;
    nationality: string | null;
    passportExpiry: string | null;
    identityDocType: string | null;
  };
  personal: {
    mobile: string | null;
    email: string | null;
    mobileVerified: boolean;
    emailVerified: boolean;
    address: string | null;
    bloodGroup: string | null;
    emergencyName: string | null;
    emergencyPhone: string | null;
  };
  academic: {
    universityName: string | null;
    prn: string | null;
    course: string | null;
    year: number | null;
    apaarId: string | null;
    collegeOfficeEmail: string | null;
    prnLocked: boolean;
    universityLocked: boolean;
  };
  sports: {
    registrations: Array<{ eventId: string; weightCategoryId: string | null }>;
    playingPosition: string | null;
  };
  medical: {
    medicalConditions: string | null;
    declarationAccepted: boolean;
    privacyAccepted: boolean;
  };
  documents: DraftDoc[];
  checks: DraftCheck[];
  ageCategory: string | null;
  isMinor: boolean;
  ageCutoffDate: string;
  catalog: CatalogSport[];
};

export type ApiErrorBody = { error: string; fieldErrors?: Record<string, string>; code?: string };
