import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";
import { otpDeliveryService, type OtpChannel } from "@/services";
import { ApiError } from "./api";
import { rateLimit } from "./rate-limit";

const OTP_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

export type OtpMeta =
  | { path: "A"; prn: string }
  | { path: "B" }
  | { path: "C" }
  | { path: "LOGIN" }
  | { path: "LOGIN_PRN"; prn: string };

function hashCode(challengeTarget: string, code: string): string {
  return createHmac("sha256", process.env.NEXTAUTH_SECRET ?? "dev").update(`${challengeTarget}:${code}`).digest("hex");
}

export async function createOtpChallenge(input: { target: string; channel: OtpChannel; meta: OtpMeta; ip: string }) {
  // Per-target and per-IP limits stop OTP bombing and enumeration.
  const perTarget = rateLimit(`otp:t:${input.target}`, 3, 10 * 60_000);
  const perIp = rateLimit(`otp:ip:${input.ip}`, 15, 10 * 60_000);
  if (!perTarget.ok || !perIp.ok) {
    const wait = Math.max(perTarget.retryAfterSec, perIp.retryAfterSec);
    throw new ApiError(429, `Too many code requests. Try again in ${Math.ceil(wait / 60)} minute(s).`);
  }
  const code = String(randomInt(100000, 1000000));
  const challenge = await prisma.otpChallenge.create({
    data: {
      target: input.target,
      channel: input.channel,
      purpose: input.meta.path === "LOGIN" || input.meta.path === "LOGIN_PRN" ? "LOGIN" : "REGISTER",
      codeHash: hashCode(input.target, code),
      meta: JSON.stringify(input.meta),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  const sent = await otpDeliveryService.send({ channel: input.channel, to: input.target, code, purpose: challenge.purpose });
  return { challengeId: challenge.id, demoCode: sent.demoCode };
}

export class OtpError extends Error {}

/** Verifies and consumes a challenge. Throws OtpError with a user-facing message. */
export async function consumeOtpChallenge(challengeId: string, code: string) {
  const c = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (!c || c.consumedAt) throw new OtpError("This code is no longer valid. Request a new one.");
  if (c.expiresAt < new Date()) throw new OtpError("This code has expired. Request a new one.");
  if (c.attempts >= MAX_ATTEMPTS) throw new OtpError("Too many wrong attempts. Request a new code.");
  const expected = Buffer.from(c.codeHash, "hex");
  const given = Buffer.from(hashCode(c.target, code.trim()), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await prisma.otpChallenge.update({ where: { id: c.id }, data: { attempts: { increment: 1 } } });
    const left = MAX_ATTEMPTS - c.attempts - 1;
    throw new OtpError(left > 0 ? `Incorrect code. ${left} attempt(s) left.` : "Too many wrong attempts. Request a new code.");
  }
  await prisma.otpChallenge.update({ where: { id: c.id }, data: { consumedAt: new Date() } });
  return { target: c.target, channel: c.channel as OtpChannel, meta: JSON.parse(c.meta ?? "{}") as OtpMeta };
}
