import { route, ok, clientIp, ApiError } from "@/lib/api";
import { requireStudentApi, studentActor } from "@/lib/rbac";
import { aadhaarOfflineSchema } from "@/lib/validation/registration";
import { applyVerifiedIndianProfile, getDraftDto } from "@/lib/registration";
import { rateLimit } from "@/lib/rate-limit";
import { aadhaarOfflineService, verificationOptions } from "@/services";

const MAX_BYTES = 2 * 1024 * 1024; // UIDAI's file is small; anything bigger isn't it

/**
 * Aadhaar Offline e-KYC: the student uploads the ZIP from UIDAI and its share code. The file is checked in memory and
 * never stored; only the verified details (and the photo, like DigiLocker) are kept.
 */
export const POST = route(async (req) => {
  const student = await requireStudentApi();
  if (!verificationOptions().aadhaarOffline) throw new ApiError(404, "Aadhaar Offline e-KYC isn't available yet.");
  if (student.status !== "DRAFT") throw new ApiError(409, "This registration has already been submitted.");
  const limit = rateLimit(`aadhaar-offline:${student.id}:${clientIp(req)}`, 6, 10 * 60_000);
  if (!limit.ok) throw new ApiError(429, "Too many attempts. Please wait a few minutes.");

  const form = await req.formData().catch(() => null);
  if (!form) throw new ApiError(400, "Expected a file upload");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ApiError(400, "Choose the ZIP file you downloaded from UIDAI.", { file: "Choose the ZIP file" });
  if (file.size > MAX_BYTES) throw new ApiError(413, "That file is too large to be the UIDAI Offline e-KYC file.", { file: "File too large" });
  const parsed = aadhaarOfflineSchema.safeParse({ shareCode: form.get("shareCode") });
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Enter the share code", { shareCode: parsed.error.issues[0]?.message ?? "Required" });

  // The share code is used only to open the file, never stored or logged.
  const profile = await aadhaarOfflineService.verify({ file: new Uint8Array(await file.arrayBuffer()), shareCode: parsed.data.shareCode });
  const { mismatches } = await applyVerifiedIndianProfile(student, profile, "AADHAAR_OFFLINE", studentActor({ ...student, fullName: profile.name }), clientIp(req));
  return ok({ mismatches, draft: await getDraftDto(student.id) });
});
