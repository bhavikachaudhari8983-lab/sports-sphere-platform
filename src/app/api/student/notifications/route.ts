import { route, ok } from "@/lib/api";
import { requireStudentApi } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

/** Marks all of the signed-in student's notifications as read (called when they've been shown). */
export const POST = route(async () => {
  const student = await requireStudentApi();
  const { count } = await prisma.notification.updateMany({ where: { studentId: student.id, readAt: null }, data: { readAt: new Date() } });
  return ok({ marked: count });
});
