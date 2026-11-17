// DEMO ONLY. Stands in for Aadhaar Offline e-KYC so the registration flow can be tried end to end. It does NOT
// read or verify a real UIDAI file: it accepts any ZIP and picks a fictional demo identity from the share code.
// Outside demo mode the service registry refuses every call (see ../index.ts), so it can never verify anyone for real.
import { ServiceError, type AadhaarOfflineService } from "../types";
import { DIGILOCKER_ACCOUNTS } from "./data/digilocker-accounts";
import { placeholderPortrait } from "@/lib/placeholder-image";
import { simulateLatency } from "./latency";

/** Demo share code for a fictional account = the last 8 digits of its demo Aadhaar number (unique across the demo accounts). */
export const demoShareCode = (aadhaar: string) => aadhaar.slice(-8);

const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

export const mockAadhaarOfflineService: AadhaarOfflineService = {
  async verify({ file, shareCode }) {
    await simulateLatency(400, 900);
    if (!isZip(file)) throw new ServiceError("NOT_ZIP", "That isn't the ZIP file downloaded from UIDAI. Upload the .zip file exactly as downloaded.");
    const acct = DIGILOCKER_ACCOUNTS.find((a) => demoShareCode(a.aadhaar) === shareCode.trim());
    if (!acct) throw new ServiceError("WRONG_SHARE_CODE", "The share code doesn't open this file. Use the share code you set when downloading it.");
    return {
      name: acct.name,
      dob: acct.dob,
      gender: acct.gender,
      aadhaarLast4: acct.aadhaar.slice(-4),
      address: acct.address,
      photo: { data: placeholderPortrait(acct.aadhaar, "official"), mimeType: "image/png", fileName: "aadhaar-offline-photo.png" },
      class10Certificate: null,
    };
  },
};
