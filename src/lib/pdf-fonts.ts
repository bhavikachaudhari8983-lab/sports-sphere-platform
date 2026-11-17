// Brand fonts for generated PDFs (ID card, certificates).
// Lato is the digital typeface in the MIT-WPU Brand Book 2026 (p.12); the TTFs live in assets/fonts (SIL OFL licence).
// If the files are missing, PDFs still render, falling back to Helvetica.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { StandardFonts, type PDFDocument, type PDFFont } from "pdf-lib";

const FILES = {
  regular: "Lato-Regular.ttf",
  bold: "Lato-Bold.ttf",
  black: "Lato-Black.ttf",
  blackItalic: "Lato-BlackItalic.ttf",
} as const;

type Weight = keyof typeof FILES;

const FALLBACK: Record<Weight, StandardFonts> = {
  regular: StandardFonts.Helvetica,
  bold: StandardFonts.HelveticaBold,
  black: StandardFonts.HelveticaBold,
  blackItalic: StandardFonts.HelveticaBoldOblique,
};

const cache = new Map<Weight, Promise<Uint8Array | null>>();

function bytesFor(w: Weight): Promise<Uint8Array | null> {
  let p = cache.get(w);
  if (!p) {
    p = readFile(join(process.cwd(), "assets/fonts", FILES[w])).catch(() => null);
    cache.set(w, p);
  }
  return p;
}

/** Embeds the Lato weights into `doc` (subset, so only used glyphs are stored). */
export async function embedBrandFonts(doc: PDFDocument): Promise<Record<Weight, PDFFont>> {
  doc.registerFontkit(fontkit);
  const out = {} as Record<Weight, PDFFont>;
  for (const w of Object.keys(FILES) as Weight[]) {
    const bytes = await bytesFor(w);
    out[w] = bytes ? await doc.embedFont(bytes, { subset: true }) : await doc.embedFont(FALLBACK[w]);
  }
  return out;
}
