import type { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider, { type GoogleProfile } from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { audit } from "./audit";
import { rateLimit, resetRateLimit } from "./rate-limit";
import { consumeOtpChallenge, OtpError } from "./otp";
import { staffLoginSchema, verifyOtpSchema } from "./validation/auth";
import { isStaffRole, UNIVERSITY_NAME } from "./constants";
import { erpService, type ErpStudent } from "@/services";
import { hostedDomainHint, matchUniversity, universitySso } from "./university-sso";

// Real bcrypt hash of a random value: comparing against it keeps timing equal for unknown emails.
const DUMMY_HASH = bcrypt.hashSync(Math.random().toString(36), 10);

type ReqLike = { headers?: Record<string, unknown> };

function ipOf(req: ReqLike | undefined): string {
  const h = req?.headers ?? {};
  const fwd = typeof h["x-forwarded-for"] === "string" ? h["x-forwarded-for"] : "";
  return fwd.split(",")[0]?.trim() || "local";
}

/** First sign-in of a host-university student: create their draft from the university's records (never typed data). */
async function createHostStudent(erp: ErpStudent, ip: string, how: string) {
  const school = erp.schoolCode ? await prisma.school.findUnique({ where: { code: erp.schoolCode }, select: { id: true } }) : null;
  const student = await prisma.student.create({
    data: {
      studentType: "OUR_INDIAN",
      isOurUniversity: true,
      prn: erp.prn,
      mobile: erp.phone,
      email: erp.email,
      mobileVerified: true,
      emailVerified: true,
      universityName: UNIVERSITY_NAME,
      course: erp.course,
      year: erp.year,
      schoolId: school?.id ?? null,
    },
  });
  await audit({ actor: { type: "STUDENT", id: student.id, name: erp.name }, action: "REGISTRATION_STARTED", studentId: student.id, summary: `Registration started (our university, PRN ${erp.prn}, ${how})`, ip });
  return student;
}

/** Host-university Google sign-in → the student's record (created from the university records on first sign-in). */
async function hostStudentForEmail(email: string, ip: string) {
  const erp = await erpService.findStudentByEmail(email);
  if (erp) return (await prisma.student.findUnique({ where: { prn: erp.prn } })) ?? createHostStudent(erp, ip, "university Google sign-in");
  return prisma.student.findFirst({ where: { email, isOurUniversity: true }, orderBy: { updatedAt: "desc" } });
}

/**
 * Visiting-university Google sign-in. The account proves the student belongs to that university, so we
 * verify their email and pre-fill the university name; identity is still checked in the outside-student flow.
 */
async function partnerStudentForEmail(email: string, universityName: string, ip: string) {
  const existing = await prisma.student.findFirst({ where: { email, studentType: "OUTSIDE_INDIAN" }, orderBy: { updatedAt: "desc" } });
  if (existing) return existing;
  const student = await prisma.student.create({
    data: { studentType: "OUTSIDE_INDIAN", isOurUniversity: false, email, emailVerified: true, universityName },
  });
  await audit({ actor: { type: "STUDENT", id: student.id, name: email }, action: "REGISTRATION_STARTED", studentId: student.id, summary: `Registration started (outside student, ${universityName}, university Google sign-in)`, ip });
  return student;
}

const sso = universitySso();

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/staff/login", error: "/staff/login" },
  providers: [
    CredentialsProvider({
      id: "staff",
      name: "Staff",
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(raw, req): Promise<User | null> {
        const parsed = staffLoginSchema.safeParse(raw);
        if (!parsed.success) throw new Error("Enter your email and password.");
        const { email, password } = parsed.data;
        const ip = ipOf(req);
        const key = `login:${email}:${ip}`;
        const limit = rateLimit(key, 5, 15 * 60_000);
        if (!limit.ok) throw new Error(`Too many attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minute(s).`);

        const user = await prisma.staffUser.findUnique({ where: { email } });
        // Always run bcrypt to keep timing similar for unknown emails.
        const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !valid || !user.active || !isStaffRole(user.role)) {
          await audit({ actor: { type: "SYSTEM" }, action: "LOGIN_FAILED", summary: `Failed staff login for ${email}`, ip });
          throw new Error("Email or password is incorrect.");
        }
        resetRateLimit(key);
        await prisma.staffUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await audit({ actor: { type: "STAFF", id: user.id, name: user.name, role: user.role }, action: "LOGIN", summary: "Signed in", ip });
        return { id: user.id, name: user.name, email: user.email, role: user.role, sportId: user.sportId };
      },
    }),
    CredentialsProvider({
      id: "student-otp",
      name: "Student OTP",
      credentials: { challengeId: { type: "text" }, code: { type: "text" } },
      async authorize(raw, req): Promise<User | null> {
        const parsed = verifyOtpSchema.safeParse(raw);
        if (!parsed.success) throw new Error("Enter the 6-digit code.");
        const ip = ipOf(req);
        const limit = rateLimit(`otp-verify:${ip}`, 20, 10 * 60_000);
        if (!limit.ok) throw new Error("Too many attempts. Please wait a few minutes.");

        let result;
        try {
          result = await consumeOtpChallenge(parsed.data.challengeId, parsed.data.code);
        } catch (e) {
          if (e instanceof OtpError) throw new Error(e.message);
          throw e;
        }
        const { target, channel, meta } = result;
        const isEmail = channel === "EMAIL";
        const byContact = isEmail ? { email: target, emailVerified: true } : { mobile: target, mobileVerified: true };

        let student = null;
        if (meta.path === "LOGIN") {
          student = await prisma.student.findFirst({ where: byContact, orderBy: { updatedAt: "desc" } });
          if (!student) throw new Error(`No registration found for this ${isEmail ? "email" : "mobile number"}.`);
        } else if (meta.path === "A") {
          student = await prisma.student.findUnique({ where: { prn: meta.prn } });
          if (!student) {
            const erp = await erpService.findStudentByPrn(meta.prn);
            if (!erp) throw new Error("Not a registered student of this university.");
            student = await createHostStudent(erp, ip, "PRN + OTP");
          }
        } else if (meta.path === "LOGIN_PRN") {
          student = await prisma.student.findUnique({ where: { prn: meta.prn } });
          if (!student) throw new Error("No registration found for this PRN.");
        } else {
          student = await prisma.student.findFirst({ where: byContact, orderBy: { updatedAt: "desc" } });
          if (!student) {
            const type = meta.path === "B" ? "OUTSIDE_INDIAN" : "INTERNATIONAL";
            student = await prisma.student.create({
              data: {
                studentType: type,
                ...(isEmail ? { email: target, emailVerified: true } : { mobile: target, mobileVerified: true }),
              },
            });
            await audit({ actor: { type: "STUDENT", id: student.id, name: target }, action: "REGISTRATION_STARTED", studentId: student.id, summary: `Registration started (${type === "OUTSIDE_INDIAN" ? "outside student" : "international student"})`, ip });
          }
        }
        await audit({ actor: { type: "STUDENT", id: student.id, name: student.fullName ?? target }, action: "LOGIN", studentId: student.id, summary: `Student signed in with ${isEmail ? "email" : "mobile"} OTP`, ip });
        return { id: student.id, name: student.fullName ?? "Student", role: "STUDENT" };
      },
    }),
    ...(sso
      ? [
          GoogleProvider({
            clientId: sso.clientId,
            clientSecret: sso.clientSecret,
            // `hd` makes Google show only university accounts; the domain is checked again in signIn below.
            // `hd` restricts Google's picker to one domain only when there's a single (host) university;
            // with visiting universities the picker stays open and the domain is checked in signIn().
            authorization: { params: { ...(hostedDomainHint(sso) ? { hd: hostedDomainHint(sso) } : {}), prompt: "select_account" } },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      const uni = sso ? matchUniversity(profile as GoogleProfile, sso) : null;
      if (!uni) return "/status?sso=wrong-domain";
      const email = (profile as GoogleProfile).email.trim().toLowerCase();
      try {
        const student = uni.isHost ? await hostStudentForEmail(email, "sso") : await partnerStudentForEmail(email, uni.name, "sso");
        if (!student) return "/status?sso=not-found";
        (user as { studentId?: string }).studentId = student.id;
        await audit({ actor: { type: "STUDENT", id: student.id, name: student.fullName ?? email }, action: "LOGIN", studentId: student.id, summary: `Student signed in with ${uni.isHost ? "university" : uni.name} Google account`, ip: "sso" });
        return true;
      } catch {
        return "/status?sso=failed";
      }
    },
    async jwt({ token, user, account }) {
      if (account?.provider === "google") {
        // Replace Google's identity with the portal's student record found in signIn().
        const studentId = (user as { studentId?: string } | undefined)?.studentId;
        const student = studentId ? await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, fullName: true } }) : null;
        if (!student) throw new Error("University sign-in failed.");
        return { ...token, uid: student.id, role: "STUDENT", sportId: null, name: student.fullName ?? "Student", email: undefined, picture: undefined, sub: student.id };
      }
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.sportId = user.sportId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = { ...session.user, id: token.uid, role: token.role, sportId: token.sportId ?? null };
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      if (token?.uid && token.role && token.role !== "STUDENT") {
        await audit({ actor: { type: "STAFF", id: token.uid, name: token.name ?? "Staff", role: token.role }, action: "LOGOUT", summary: "Signed out" });
      }
    },
  },
};
