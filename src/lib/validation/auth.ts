import { z } from "zod";
import { anyMobile, email, indianMobile, prn } from "./common";

export const staffLoginSchema = z.object({
  email: email,
  password: z.string().min(1, "Enter your password").max(200),
});

export const prnLookupSchema = z.object({ prn });

export const sendOtpSchema = z.union([
  z.object({ path: z.literal("A"), prn, channel: z.enum(["SMS", "EMAIL"]) }),
  z.object({ path: z.literal("B"), mobile: indianMobile }),
  z.object({ path: z.literal("C"), channel: z.literal("SMS"), mobile: anyMobile }),
  z.object({ path: z.literal("C"), channel: z.literal("EMAIL"), email }),
  z.object({ path: z.literal("LOGIN"), channel: z.literal("SMS"), mobile: anyMobile }),
  z.object({ path: z.literal("LOGIN"), channel: z.literal("EMAIL"), email }),
  z.object({ path: z.literal("LOGIN_PRN"), prn, channel: z.enum(["SMS", "EMAIL"]) }),
]);
export type SendOtpInput = z.input<typeof sendOtpSchema>;

export const verifyOtpSchema = z.object({
  challengeId: z.string().min(10).max(40),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
