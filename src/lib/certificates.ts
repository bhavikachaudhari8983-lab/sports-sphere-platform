// Tamper-evident certificates. Everything printed is frozen at issue time and signed with an HMAC,
// so /verify/<code> can prove a certificate is genuine and unchanged — and say so when it was revoked.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { embedBrandFonts } from "./pdf-fonts";
import type { Certificate } from "@prisma/client";
import { prisma } from "./prisma";
import { audit, type Actor } from "./audit";
import { ApiError } from "./api";
import { getSettings } from "./settings";
import { institutionOf } from "./competition";
import { APP_NAME, CERT_LABEL, MEDAL_FOR_POSITION, type CertKind } from "./constants";
import { formatDob } from "./utils";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function secret(): string {
  const s = process.env.QR_SIGNING_SECRET;
  if (!s) throw new Error("QR_SIGNING_SECRET is not set");
  return s;
}

type Signed = Pick<Certificate, "code" | "recipient" | "institution" | "title" | "kind" | "division" | "issuedAt">;
function signatureOf(c: Signed): string {
  const payload = ["CERT1", c.code, c.recipient, c.institution, c.title, c.kind, c.division ?? "", c.issuedAt.toISOString()].join("|");
  return createHmac("sha256", secret()).update(payload).digest("base64url").slice(0, 32);
}

export function certificateUrl(code: string): string {
  const base = (process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/verify/${code}`;
}

async function newCode(): Promise<string> {
  const yy = new Date().getFullYear().toString().slice(-2);
  for (let i = 0; i < 10; i++) {
    let c = "";
    for (let j = 0; j < 6; j++) c += ALPHABET[randomInt(ALPHABET.length)];
    const code = `CERT-${yy}-${c}`;
    if (!(await prisma.certificate.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error("Could not allocate a certificate code");
}

/**
 * Issues certificates for a finalised event: participation for every approved athlete who took part,
 * and a medal certificate for every podium athlete (each member of a podium team). Existing ones are kept.
 */
export async function issueForEvent(eventId: string, actor: Actor & { type: "STAFF" }, ip: string | null) {
  const ev = await prisma.event.findUnique({ where: { id: eventId }, include: { sport: true, tournament: true } });
  if (!ev) throw new ApiError(404, "Event not found");
  if (!ev.resultsFinal) throw new ApiError(409, "Finalise the results first, so medal certificates are correct.");
  const settings = await getSettings();
  const student = { select: { id: true, fullName: true, universityName: true, status: true, school: { select: { name: true } } } } as const;
  const [regs, placings] = await Promise.all([
    prisma.registration.findMany({ where: { eventId, student: { status: "APPROVED" } }, include: { weightCategory: true, student } }),
    prisma.placing.findMany({ where: { eventId, position: { lte: 3 } }, include: { student, team: { include: { members: { include: { student } } } } } }),
  ]);
  const wanted: Array<{ s: { id: string; fullName: string | null; universityName: string | null; school: { name: string } | null }; kind: CertKind; division: string | null }> = [];
  for (const r of regs) wanted.push({ s: r.student, kind: "PARTICIPATION", division: ev.sport.isWeightCategory ? r.weightCategory?.name ?? null : null });
  for (const p of placings) {
    const kind = MEDAL_FOR_POSITION[p.position];
    if (p.student) wanted.push({ s: p.student, kind, division: p.division });
    for (const m of p.team?.members ?? []) if (m.student.status === "APPROVED") wanted.push({ s: m.student, kind, division: p.division });
  }

  let issued = 0;
  for (const w of wanted) {
    const exists = await prisma.certificate.findFirst({ where: { studentId: w.s.id, eventId, kind: w.kind, division: w.division }, select: { id: true } });
    if (exists) continue;
    const base = {
      code: await newCode(),
      recipient: w.s.fullName ?? "—",
      institution: institutionOf(w.s),
      title: `${ev.sport.name} · ${ev.name}${w.division ? ` · ${w.division}` : ""} — ${ev.tournament?.name ?? settings.meetName}`,
      kind: w.kind,
      division: w.division,
      issuedAt: new Date(Math.floor(Date.now() / 1000) * 1000),
    };
    await prisma.certificate.create({ data: { ...base, studentId: w.s.id, eventId, issuedById: actor.id, signature: signatureOf(base) } });
    issued++;
  }
  await audit({ actor, action: "CERTIFICATE_ISSUED", entityType: "Event", entityId: eventId, summary: `${issued} certificate${issued === 1 ? "" : "s"} issued for ${ev.sport.name} · ${ev.name}`, ip });
  return issued;
}

export async function revokeCertificate(code: string, reason: string, actor: Actor, ip: string | null) {
  const c = await prisma.certificate.findUnique({ where: { code } });
  if (!c) throw new ApiError(404, "Certificate not found");
  if (c.revokedAt) throw new ApiError(409, "Already revoked.");
  await prisma.certificate.update({ where: { code }, data: { revokedAt: new Date(), revokeReason: reason } });
  await audit({ actor, action: "CERTIFICATE_REVOKED", studentId: c.studentId, entityType: "Certificate", entityId: c.id, summary: `Certificate ${code} revoked: ${reason}`, ip });
}

export type Verification =
  | { state: "VALID"; cert: Certificate }
  | { state: "REVOKED"; cert: Certificate }
  | { state: "TAMPERED"; cert: Certificate }
  | { state: "NOT_FOUND" };

/** Public check. Every lookup is logged (without the visitor's identity beyond IP). */
export async function verifyCertificate(code: string, ip: string | null): Promise<Verification> {
  const c = await prisma.certificate.findUnique({ where: { code: code.trim().toUpperCase() } });
  const result: Verification = !c
    ? { state: "NOT_FOUND" }
    : (() => {
        const expected = Buffer.from(signatureOf(c));
        const given = Buffer.from(c.signature);
        const intact = expected.length === given.length && timingSafeEqual(expected, given);
        return !intact ? { state: "TAMPERED", cert: c } : c.revokedAt ? { state: "REVOKED", cert: c } : { state: "VALID", cert: c };
      })();
  await audit({ actor: { type: "SYSTEM" }, action: "CERTIFICATE_VERIFIED", studentId: c?.studentId ?? null, entityType: "Certificate", entityId: c?.id, summary: `Certificate ${code.slice(0, 20)} checked: ${result.state}`, ip });
  return result;
}

const KIND_COLOUR: Record<CertKind, [number, number, number]> = {
  PARTICIPATION: [0.933, 0.478, 0.169],
  GOLD: [0.78, 0.6, 0.1],
  SILVER: [0.55, 0.58, 0.62],
  BRONZE: [0.66, 0.4, 0.2],
};

/** A4 landscape PDF with a QR code that opens the public verification page. */
export async function renderCertificatePdf(c: Certificate): Promise<Uint8Array> {
  const W = 842, H = 595;
  const doc = await PDFDocument.create();
  doc.setTitle(`${CERT_LABEL[c.kind as CertKind] ?? c.kind} — ${c.recipient}`);
  doc.setAuthor(APP_NAME);
  const page = doc.addPage([W, H]);
  const lato = await embedBrandFonts(doc);
  const bold = lato.bold;
  const font = lato.regular;
  const mono = await doc.embedFont(StandardFonts.Courier);
  const navy = rgb(0.055, 0.078, 0.188);
  const muted = rgb(0.35, 0.39, 0.47);
  const [r, g, b] = KIND_COLOUR[c.kind as CertKind] ?? KIND_COLOUR.PARTICIPATION;
  const accent = rgb(r, g, b);
  const clean = (t: string) => t.replace(/[−–—]/g, "-").replace(/[^\x20-\x7E·]/g, "");
  const centre = (t: string, y: number, size: number, f = font, color = navy) => {
    const s = clean(t);
    page.drawText(s, { x: (W - f.widthOfTextAtSize(s, size)) / 2, y, size, font: f, color });
  };

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 0.985, 0.965) });
  page.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: accent, borderWidth: 3 });
  page.drawRectangle({ x: 34, y: 34, width: W - 68, height: H - 68, borderColor: navy, borderWidth: 0.6 });
  const logoBytes = await readFile(join(process.cwd(), "public/brand/sports-sphere-logo.png")).catch(() => null);
  if (logoBytes) {
    const logo = await doc.embedPng(logoBytes);
    page.drawImage(logo, { x: W / 2 - 34, y: H - 132, width: 68, height: 68 });
  }
  centre("SPORTS SPHERE", H - 152, 14, lato.blackItalic);
  centre(CERT_LABEL[c.kind as CertKind] ?? c.kind, H - 205, 34, lato.black, accent);
  centre("This certifies that", H - 245, 13, font, muted);
  centre(c.recipient, H - 290, 30, bold);
  centre(c.institution, H - 318, 13, font, muted);
  centre(c.kind === "PARTICIPATION" ? "took part in" : `won the ${c.kind.toLowerCase()} medal in`, H - 352, 13, font, muted);
  const title = clean(c.title);
  const [line1, line2] = title.length > 70 ? [title.slice(0, title.lastIndexOf(" ", 70)), title.slice(title.lastIndexOf(" ", 70) + 1)] : [title, ""];
  centre(line1, H - 380, 15, bold);
  if (line2) centre(line2, H - 400, 15, bold);
  page.drawText(`Issued ${formatDob(c.issuedAt.toISOString().slice(0, 10))}`, { x: 70, y: 92, size: 11, font, color: muted });
  page.drawText(c.code, { x: 70, y: 74, size: 12, font: mono, color: navy });
  page.drawText("Scan the QR code or visit the link to verify this certificate.", { x: 70, y: 58, size: 8, font, color: muted });
  page.drawText(clean(certificateUrl(c.code)), { x: 70, y: 46, size: 8, font: mono, color: muted });

  const qr = await doc.embedPng(Buffer.from((await QRCode.toDataURL(certificateUrl(c.code), { margin: 1, width: 300, errorCorrectionLevel: "M" })).split(",")[1], "base64"));
  page.drawImage(qr, { x: W - 70 - 96, y: 46, width: 96, height: 96 });
  return doc.save();
}
