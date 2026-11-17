import { route, parseJson, ok, clientIp, ApiError } from "@/lib/api";
import { requireStudentApi, studentActor } from "@/lib/rbac";
import { manualIdentitySchema } from "@/lib/validation/registration";
import { applyManualIdentity, getDraftDto } from "@/lib/registration";
import { rateLimit } from "@/lib/rate-limit";
import { verificationOptions } from "@/services";

/** Manual identity route: typed details + an uploaded Government ID. Verified only after the desk check. */
export const POST = route(async (req) => {
  const student = await requireStudentApi();
  if (!verificationOptions().manual) throw new ApiError(404, "This option isn't available.");
  const limit = rateLimit(`id-manual:${student.id}`, 10, 10 * 60_000);
  if (!limit.ok) throw new ApiError(429, "Too many attempts. Please wait a few minutes.");
  const input = await parseJson(req, manualIdentitySchema);
  const { mismatches } = await applyManualIdentity(student, input, studentActor({ ...student, fullName: input.fullName }), clientIp(req));
  return ok({ mismatches, draft: await getDraftDto(student.id) });
});
