import { route, ApiError, clientIp } from "@/lib/api";
import { getSessionUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { audit, type Actor } from "@/lib/audit";
import { DOC_ACCESS, DOC_LABEL, isDocType, isStaffRole, roleSatisfies } from "@/lib/constants";

/** The ONLY way to read an uploaded file. Checks role/ownership and logs every view. */
export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "Please sign in.");
  const doc = await prisma.document.findUnique({ where: { id }, include: { student: { select: { id: true, fullName: true, sportsId: true, status: true, registrations: { select: { event: { select: { sportId: true } } } } } } } });
  if (!doc || !isDocType(doc.type)) throw new ApiError(404, "Document not found.");

  let actor: Actor;
  if (user.role === "STUDENT") {
    if (doc.studentId !== user.id) throw new ApiError(404, "Document not found.");
    actor = { type: "STUDENT", id: user.id, name: doc.student.fullName ?? "Student" };
  } else {
    const staff = await prisma.staffUser.findUnique({ where: { id: user.id } });
    if (!staff || !staff.active || !isStaffRole(staff.role)) throw new ApiError(401, "Please sign in.");
    if (!roleSatisfies(staff.role, DOC_ACCESS[doc.type])) throw new ApiError(403, "Your role cannot view this document.");
    // Coaches: only approved players in their own sport.
    if (staff.role === "COACH") {
      const inSport = doc.student.registrations.some((r) => r.event.sportId === staff.sportId);
      if (doc.student.status !== "APPROVED" || !inSport) throw new ApiError(403, "Not one of your players.");
    }
    actor = { type: "STAFF", id: staff.id, name: staff.name, role: staff.role };
  }

  const data = await readStoredFile(doc.storageKey).catch(() => null);
  if (!data) throw new ApiError(404, "File is missing from storage.");

  await audit({ actor, action: "DOCUMENT_VIEWED", studentId: doc.studentId, entityType: "Document", entityId: doc.id, summary: `Viewed ${DOC_LABEL[doc.type]} of ${doc.student.fullName ?? "student"}`, ip: clientIp(req) });

  const headers: Record<string, string> = {
    "Content-Type": doc.mimeType,
    "Content-Length": String(data.length),
    "Content-Disposition": `inline; filename="${doc.originalName.replace(/"/g, "")}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (doc.mimeType.startsWith("image/")) headers["Content-Security-Policy"] = "default-src 'none'";
  return new Response(new Uint8Array(data), { headers });
});
