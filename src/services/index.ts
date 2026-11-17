// ┌──────────────────────────────────────────────────────────────────────────┐
// │ Service registry — the ONLY place that decides which implementation runs. │
// │ To go live, write a class implementing the interface in ./types.ts and    │
// │ swap the mock here. Nothing else in the app needs to change.              │
// └──────────────────────────────────────────────────────────────────────────┘
import type { AadhaarOfflineService, DigiLockerService, ErpService, InternationalAdmissionsService, MessagingService, OtpDeliveryService, PassportVerificationService } from "./types";
import { mockErpService } from "./mock/erp";
import { mockDigiLockerService } from "./mock/digilocker";
import { mockOtpDeliveryService } from "./mock/otp-delivery";
import { mockPassportService } from "./mock/passport";
import { mockAdmissionsService } from "./mock/admissions";
import { mockMessagingService } from "./mock/messaging";
import { mockAadhaarOfflineService } from "./mock/aadhaar-offline";
import { mockEmailService } from "./mock/email";
import { smtpEmailService } from "./smtp-email";
import type { EmailService } from "./types";
import { ServiceError } from "./types";
import { isDemoMode } from "@/lib/env";

/**
 * Mocks return fictional "verified" data. They must never answer outside demo mode, or anyone could
 * pass identity checks with made-up details. Outside demo mode a mock refuses every call with a clear
 * error until the real integration replaces it below.
 */
function demoOnly<T extends object>(mock: T, label: string): T {
  return new Proxy(mock, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || isDemoMode()) return value;
      return () => {
        throw new ServiceError("SERVICE_NOT_CONNECTED", `${label} is not connected yet, so this step can't be completed. Please contact the sports office.`);
      };
    },
  });
}

export const erpService: ErpService = demoOnly(mockErpService, "The university student records system (ERP)");
export const digiLockerService: DigiLockerService = demoOnly(mockDigiLockerService, "DigiLocker verification");
export const otpDeliveryService: OtpDeliveryService = demoOnly(mockOtpDeliveryService, "SMS / email delivery");
export const passportService: PassportVerificationService = demoOnly(mockPassportService, "Passport verification");
export const admissionsService: InternationalAdmissionsService = demoOnly(mockAdmissionsService, "The international admissions system");
export const messagingService: MessagingService = demoOnly(mockMessagingService, "SMS / WhatsApp messaging");
export const aadhaarOfflineService: AadhaarOfflineService = demoOnly(mockAadhaarOfflineService, "Aadhaar Offline e-KYC");

/**
 * Email: real SMTP when SMTP_URL and EMAIL_FROM are set; otherwise the demo logger in demo mode; otherwise null
 * (not configured: notices still appear in the portal, they just aren't emailed).
 */
export function emailService(): EmailService | null {
  const url = process.env.SMTP_URL?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (url && from) return smtpEmailService(url, from);
  return isDemoMode() ? mockEmailService : null;
}

/**
 * Which identity-verification routes students are offered. A route is shown only when it can genuinely work: today
 * DigiLocker and Aadhaar Offline e-KYC are demo mocks, so outside demo mode only the manual route (Government ID,
 * checked at the desk) is offered. When a real implementation is wired in above, set its flag to true.
 */
export function verificationOptions(): { digilocker: boolean; aadhaarOffline: boolean; manual: boolean } {
  return { digilocker: isDemoMode(), aadhaarOffline: isDemoMode(), manual: true };
}

export { ServiceError };
export type * from "./types";
