// Contracts for every external system. The app only depends on these interfaces.
// Mock implementations live in ./mock; real ones are wired in ./index.ts.

export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export type BinaryFile = { data: Uint8Array; mimeType: "image/png" | "image/jpeg" | "application/pdf"; fileName: string };

// ---------- University ERP ----------
export type ErpStudent = {
  prn: string;
  name: string;
  dob: string; // YYYY-MM-DD
  gender: "MALE" | "FEMALE" | "OTHER";
  phone: string;
  email: string;
  course: string;
  year: number;
  /** School/faculty code from the ERP, e.g. "CSE". Decides which school squads the student can join. */
  schoolCode: string | null;
};

export interface ErpService {
  findStudentByPrn(prn: string): Promise<ErpStudent | null>;
  /** University email (e.g. from "Sign in with Google") → the student's record. */
  findStudentByEmail(email: string): Promise<ErpStudent | null>;
  getStudentPhoto(prn: string): Promise<BinaryFile | null>;
}

// ---------- DigiLocker (Aadhaar e-KYC + issued documents) ----------
export type DigiLockerProfile = {
  name: string;
  dob: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  aadhaarLast4: string; // the provider never returns more than this to us
  address: string;
  photo: BinaryFile;
  class10Certificate: BinaryFile | null;
};

export interface DigiLockerService {
  /** Begins the consent flow; the provider sends an OTP to the Aadhaar-linked mobile. */
  startConsent(input: { aadhaarNumber: string }): Promise<{ requestId: string; maskedMobile: string; demoOtp?: string }>;
  /** Completes consent after the student enters the OTP and approves sharing. */
  completeConsent(input: { requestId: string; otp: string }): Promise<DigiLockerProfile>;
}

// ---------- Aadhaar Offline e-KYC (UIDAI-signed file uploaded by the student) ----------
// The student downloads a password-protected ZIP from UIDAI (password = the share code they set) containing an XML
// file digitally signed by UIDAI. A real implementation must open the ZIP with the share code, verify UIDAI's
// signature against UIDAI's published certificate, and read the details ONLY from the signed content. It must be
// written against UIDAI's official specification and tested with genuine files; it is not built yet.
export interface AadhaarOfflineService {
  verify(input: { file: Uint8Array; shareCode: string }): Promise<DigiLockerProfile>;
}

// ---------- Email (notifications) ----------
export type EmailMessage = { to: string; subject: string; text: string; html: string };
export interface EmailService {
  /** "DEMO" = not really sent (demo mode, message only logged). */
  send(message: EmailMessage): Promise<"SENT" | "DEMO">;
}

// ---------- OTP delivery (SMS / email gateway) ----------
export type OtpChannel = "SMS" | "EMAIL";

export interface OtpDeliveryService {
  send(input: { channel: OtpChannel; to: string; code: string; purpose: string }): Promise<{ delivered: boolean; demoCode?: string }>;
}

// ---------- Passport MRZ verification ----------
export type MrzInput = { passportNumber: string; nationality: string; dob: string; expiry: string; mrzLine2: string };

// ---------- Bulk messaging (announcements) ----------
export type MessageChannel = "SMS" | "WHATSAPP";
export interface MessagingService {
  /** Sends one short text to many mobile numbers. Returns how many were accepted by the provider. */
  broadcast(input: { channel: MessageChannel; to: string[]; text: string }): Promise<{ accepted: number }>;
}

export interface PassportVerificationService {
  verifyMrz(input: MrzInput): Promise<{ valid: boolean; problems: string[] }>;
  /** Photo extracted from the passport chip / photo page, used as the reference image. */
  getReferencePhoto(input: { passportNumber: string; nationality: string }): Promise<BinaryFile | null>;
}

// ---------- International admissions office ----------
export type AdmissionsRecord = {
  passportNumber: string;
  nationality: string;
  name: string;
  dob: string;
  program: string;
  email: string;
};

export interface InternationalAdmissionsService {
  findByPassport(passportNumber: string, nationality: string): Promise<AdmissionsRecord | null>;
}
