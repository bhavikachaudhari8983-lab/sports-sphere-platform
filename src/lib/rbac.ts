import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import { ApiError } from "./api";
import type { Actor } from "./audit";
import { isStaffRole, roleSatisfies, type StaffRole } from "./constants";

export type StaffSession = { id: string; name: string; role: StaffRole; sportId: string | null };

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

/** Re-checks the DB so deactivated staff lose access immediately, not when their JWT expires. */
async function loadStaff(id: string): Promise<StaffSession | null> {
  const u = await prisma.staffUser.findUnique({ where: { id }, select: { id: true, name: true, role: true, sportId: true, active: true } });
  if (!u || !u.active || !isStaffRole(u.role)) return null;
  return { id: u.id, name: u.name, role: u.role, sportId: u.sportId };
}

/** For server components/pages. Redirects to login or the 403 page. */
export async function requireStaffPage(roles: readonly StaffRole[], callbackUrl: string): Promise<StaffSession> {
  const user = await getSessionUser();
  if (!user || user.role === "STUDENT") redirect(`/staff/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  const staff = await loadStaff(user.id);
  if (!staff) redirect(`/staff/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  if (!roleSatisfies(staff.role, roles)) redirect("/forbidden");
  return staff;
}

/** For API routes. Throws 401/403 ApiError. */
export async function requireStaffApi(roles: readonly StaffRole[]): Promise<StaffSession> {
  const user = await getSessionUser();
  if (!user || user.role === "STUDENT") throw new ApiError(401, "Please sign in.");
  const staff = await loadStaff(user.id);
  if (!staff) throw new ApiError(401, "Please sign in.");
  if (!roleSatisfies(staff.role, roles)) throw new ApiError(403, "You do not have permission to do this.");
  return staff;
}

export async function requireStudentApi() {
  const user = await getSessionUser();
  if (!user || user.role !== "STUDENT") throw new ApiError(401, "Please verify your mobile or email to continue.");
  const student = await prisma.student.findUnique({ where: { id: user.id } });
  if (!student) throw new ApiError(401, "Your session has ended. Please sign in again.");
  return student;
}

export function staffActor(s: StaffSession): Actor {
  return { type: "STAFF", id: s.id, name: s.name, role: s.role };
}

export function studentActor(s: { id: string; fullName: string | null; mobile: string | null; email: string | null }): Actor {
  return { type: "STUDENT", id: s.id, name: s.fullName ?? s.mobile ?? s.email ?? "Student" };
}
