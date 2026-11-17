import { route, ApiError } from "@/lib/api";
import { getSessionUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { renderCertificatePdf } from "@/lib/certificates";
import { roleSatisfies } from "@/lib/constants";

/** PDF download for the certificate's owner or an admin. Anyone can VERIFY at /verify/<code>; only they can download. */
export const GET = route<{ params: Promise<{ code: string }> }>(async (_req, { params }) => {
  const { code } = await params;
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "Please sign in.");
  const c = await prisma.certificate.findUnique({ where: { code } });
  if (!c || (!roleSatisfies(user.role, ["ADMIN"]) && !(user.role === "STUDENT" && user.id === c.studentId))) throw new ApiError(404, "Certificate not found");
  if (c.revokedAt) throw new ApiError(410, "This certificate was revoked.");
  const pdf = await renderCertificatePdf(c);
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${c.code}.pdf"`, "Cache-Control": "private, no-store" } });
});
