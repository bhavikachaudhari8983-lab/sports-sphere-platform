import { readFile } from "node:fs/promises";
import { join } from "node:path";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { embedBrandFonts } from "./pdf-fonts";
import { prisma } from "./prisma";
import { qrPayload } from "./qr";
import { readStoredFile } from "./storage";
import { getAgeCategory } from "./registration";
import { getSettings } from "./settings";
import { APP_NAME, UNIVERSITY_NAME } from "./constants";

export type IdCardData = {
  sportsId: string;
  name: string;
  ageCategory: string | null;
  sports: string[];
  university: string;
  meetName: string;
  photoDocId: string | null;
  qrDataUrl: string;
  validUntil: string;
};

/** Card data for an APPROVED student, or null. */
export async function getIdCardData(studentId: string): Promise<IdCardData | null> {
  const s = await prisma.student.findUnique({
    where: { id: studentId },
    include: { documents: { where: { type: { in: ["PHOTO", "SELFIE"] } } }, registrations: { include: { event: { include: { sport: true } }, weightCategory: true } } },
  });
  if (!s || s.status !== "APPROVED" || !s.sportsId) return null;
  const [{ ageCategory }, settings] = await Promise.all([getAgeCategory(s.dob), getSettings()]);
  // Prefer the passport-size photo; fall back to the selfie. pdf-lib embeds only JPG/PNG.
  const photo = s.documents.find((d) => d.type === "PHOTO" && d.mimeType !== "image/webp") ?? s.documents.find((d) => d.type === "SELFIE" && d.mimeType !== "image/webp");
  const sports = [...new Set(s.registrations.map((r) => r.event.sport.name + (r.weightCategory ? ` ${r.weightCategory.name}` : "")))];
  return {
    sportsId: s.sportsId,
    name: s.fullName ?? "",
    ageCategory,
    sports,
    university: s.universityName ?? UNIVERSITY_NAME,
    meetName: settings.meetName,
    photoDocId: photo?.id ?? null,
    qrDataUrl: await QRCode.toDataURL(qrPayload(s.sportsId), { errorCorrectionLevel: "M", margin: 1, width: 360 }),
    validUntil: `31 Dec ${settings.ageCutoffDate.slice(0, 4)}`,
  };
}

export async function renderIdCardPdf(card: IdCardData): Promise<Uint8Array> {
  const W = 340; // ~ CR80 card ratio, scaled up for legibility
  const H = 214;
  const doc = await PDFDocument.create();
  doc.setTitle(`Sports ID ${card.sportsId}`);
  doc.setAuthor(APP_NAME);
  const page = doc.addPage([W, H]);
  const lato = await embedBrandFonts(doc);
  const bold = lato.bold;
  const font = lato.regular;
  const mono = await doc.embedFont(StandardFonts.CourierBold);
  const navy = rgb(0.055, 0.078, 0.188); // logo ink #0E1430
  const cream = rgb(1, 0.973, 0.941); // #FFF8F0
  const orange = rgb(0.933, 0.478, 0.169); // logo orange #EE7A2B

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 0, y: H - 40, width: W, height: 40, color: cream });
  page.drawRectangle({ x: 0, y: H - 44, width: W, height: 4, color: orange });
  const logoBytes = await readFile(join(process.cwd(), "public/brand/sports-sphere-logo.png")).catch(() => null);
  if (logoBytes) {
    const logo = await doc.embedPng(logoBytes);
    page.drawCircle({ x: 26, y: H - 20, size: 16, color: rgb(1, 1, 1) });
    page.drawImage(logo, { x: 11, y: H - 35, width: 30, height: 30 });
  }
  page.drawText("SPORTS", { x: 48, y: H - 18, size: 10, font: lato.blackItalic, color: navy });
  page.drawText("SPHERE", { x: 48 + lato.blackItalic.widthOfTextAtSize("SPORTS ", 10), y: H - 18, size: 10, font: lato.blackItalic, color: rgb(0.894, 0.341, 0.165) });
  page.drawText(`SPORTS ID · ${card.meetName}`.slice(0, 56), { x: 48, y: H - 31, size: 7, font, color: rgb(0.28, 0.33, 0.41) });

  // Photo
  const px = 12, py = 40, pw = 78, ph = 100;
  page.drawRectangle({ x: px - 1, y: py - 1, width: pw + 2, height: ph + 2, color: rgb(0.89, 0.91, 0.94) });
  if (card.photoDocId) {
    const d = await prisma.document.findUnique({ where: { id: card.photoDocId } });
    const bytes = d ? await readStoredFile(d.storageKey).catch(() => null) : null;
    if (d && bytes) {
      const img = d.mimeType === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const scale = Math.max(pw / img.width, ph / img.height);
      const iw = img.width * scale, ih = img.height * scale;
      // Centre-crop by drawing the image larger and covering overflow with white bands.
      page.drawImage(img, { x: px + (pw - iw) / 2, y: py + (ph - ih) / 2, width: iw, height: ih });
      page.drawRectangle({ x: 0, y: 0, width: px - 1, height: H - 44, color: rgb(1, 1, 1) });
      page.drawRectangle({ x: px + pw + 1, y: 0, width: 8, height: H - 44, color: rgb(1, 1, 1) });
      page.drawRectangle({ x: 0, y: py + ph + 1, width: px + pw + 9, height: H - 44 - (py + ph + 1), color: rgb(1, 1, 1) });
      page.drawRectangle({ x: 0, y: 0, width: px + pw + 9, height: py - 1, color: rgb(1, 1, 1) });
    }
  }

  // Details
  const tx = 102;
  page.drawText(card.name.slice(0, 28), { x: tx, y: 150, size: 12, font: bold, color: navy });
  page.drawText("AGE CATEGORY", { x: tx, y: 132, size: 6, font: bold, color: rgb(0.39, 0.45, 0.55) });
  page.drawText(card.ageCategory ?? "-", { x: tx, y: 119, size: 12, font: bold, color: rgb(0.08, 0.5, 0.24) });
  page.drawText("SPORTS", { x: tx, y: 104, size: 6, font: bold, color: rgb(0.39, 0.45, 0.55) });
  page.drawText(card.university.slice(0, 40), { x: tx, y: 140, size: 6.5, font, color: rgb(0.39, 0.45, 0.55) });
  card.sports.slice(0, 4).forEach((sp, i) => page.drawText(sp.replace("−", "-").slice(0, 26), { x: tx, y: 93 - i * 10, size: 8, font, color: rgb(0.06, 0.09, 0.16) }));
  page.drawText(card.sportsId, { x: 12, y: 22, size: 11, font: mono, color: navy });
  page.drawText(`Valid until ${card.validUntil} · Verify by scanning`, { x: 12, y: 10, size: 6, font, color: rgb(0.39, 0.45, 0.55) });

  // QR
  const qrPng = Buffer.from(card.qrDataUrl.split(",")[1], "base64");
  const qr = await doc.embedPng(qrPng);
  page.drawImage(qr, { x: W - 104, y: 14, width: 92, height: 92 });
  return doc.save();
}
