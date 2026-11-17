import { route, parseJson, ok, clientIp, ApiError } from "@/lib/api";
import { sendOtpSchema } from "@/lib/validation/auth";
import { createOtpChallenge } from "@/lib/otp";
import { audit } from "@/lib/audit";
import { erpService } from "@/services";
import { prisma } from "@/lib/prisma";
import { maskEmail, maskPhone } from "@/lib/utils";

/** Public: sends a one-time code. Path A sends to the contact stored in the ERP, never one typed by the student. */
export const POST = route(async (req) => {
  const input = await parseJson(req, sendOtpSchema);
  const ip = clientIp(req);

  let target: string;
  let channel: "SMS" | "EMAIL";
  if (input.path === "A") {
    const erp = await erpService.findStudentByPrn(input.prn);
    if (!erp) throw new ApiError(404, "Not a registered student of this university.");
    channel = input.channel;
    target = channel === "SMS" ? erp.phone : erp.email;
  } else if (input.path === "LOGIN_PRN") {
    // Host-university student signing in with their PRN. The code goes to the contact in the university's
    // records (or, failing that, the one verified at registration), never to anything typed here.
    // Like mobile/email sign-in, it doesn't reveal here whether the PRN is registered: that's only said
    // after a correct code (the same PRN-exists check is already public at registration step 1).
    const erp = await erpService.findStudentByPrn(input.prn);
    const student = await prisma.student.findUnique({ where: { prn: input.prn.trim().toUpperCase() }, select: { mobile: true, email: true, mobileVerified: true, emailVerified: true } });
    channel = input.channel;
    const fromErp = channel === "SMS" ? erp?.phone : erp?.email;
    const fromRecord = !student ? null : channel === "SMS" ? (student.mobileVerified ? student.mobile : null) : student.emailVerified ? student.email : null;
    const t = fromErp || fromRecord;
    if (!t) throw new ApiError(404, "We couldn't find this PRN in the university records. Check it, or sign in with your mobile or email.", { prn: "PRN not found" });
    target = t;
  } else if (input.path === "B") {
    channel = "SMS";
    target = input.mobile;
  } else if (input.channel === "EMAIL") {
    channel = "EMAIL";
    target = input.email;
  } else {
    channel = "SMS";
    target = input.mobile;
  }

  const meta =
    input.path === "A" ? { path: "A" as const, prn: input.prn } : input.path === "LOGIN_PRN" ? { path: "LOGIN_PRN" as const, prn: input.prn.trim().toUpperCase() } : { path: input.path };
  const { challengeId, demoCode } = await createOtpChallenge({ target, channel, meta, ip });
  const masked = channel === "SMS" ? maskPhone(target) : maskEmail(target);
  await audit({ actor: { type: "SYSTEM" }, action: "OTP_SENT", summary: `OTP sent by ${channel === "SMS" ? "SMS" : "email"} to ${masked} (${input.path === "LOGIN" ? "status login" : input.path === "LOGIN_PRN" ? "status login by PRN" : `registration path ${input.path}`})`, ip });
  return ok({ challengeId, maskedTarget: masked, channel, demoCode });
});
