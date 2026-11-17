"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileDown, ImageDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/feedback";
import { Alert } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import type { IdCardData } from "@/lib/id-card";
import { api } from "@/lib/client-api";

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

/** Renders the card preview and draws a 2x PNG on a canvas for download. */
export function IdCard() {
  const [card, setCard] = useState<IdCardData | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    api<IdCardData>("/api/student/id-card").then((r) => (r.ok ? setCard(r.data) : setError(r.error)));
  }, []);

  async function downloadPng() {
    if (!card) return;
    setBusy(true);
    try {
      const W = 1012, H = 638;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      // next/font gives Lato a generated family name; read it from the CSS variable so the card uses the brand font.
      const F = getComputedStyle(document.documentElement).getPropertyValue("--font-lato").trim() || "Lato, Arial, sans-serif";
      const M = getComputedStyle(document.documentElement).getPropertyValue("--font-jetbrains").trim() || "monospace";
      await document.fonts.ready;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#FFF8F0";
      ctx.fillRect(0, 0, W, 120);
      ctx.fillStyle = "#EE7A2B";
      ctx.fillRect(0, 120, W, 12);
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 30px ${F}`;
      const logo = await loadImg("/brand/sports-sphere-logo.png");
      ctx.save();
      ctx.beginPath();
      ctx.arc(76, 60, 46, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.clip();
      ctx.drawImage(logo, 30, 14, 92, 92);
      ctx.restore();
      ctx.fillStyle = "#0E1430";
      ctx.font = `italic 800 30px ${F}`;
      ctx.fillText("SPORTS", 140, 58);
      ctx.fillStyle = "#E4572A";
      ctx.fillText("SPHERE", 140 + ctx.measureText("SPORTS ").width, 58);
      ctx.font = `400 22px ${F}`;
      ctx.fillStyle = "#475569";
      ctx.font = `400 22px ${F}`;
      ctx.fillText(`SPORTS ID · ${card.meetName}`, 140, 96);
      if (card.photoDocId) {
        const photo = await loadImg(`/api/documents/${card.photoDocId}`);
        const pw = 232, ph = 298, px = 36, py = 166;
        const s = Math.max(pw / photo.width, ph / photo.height);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph, 14);
        ctx.clip();
        ctx.drawImage(photo, px + (pw - photo.width * s) / 2, py + (ph - photo.height * s) / 2, photo.width * s, photo.height * s);
        ctx.restore();
      }
      ctx.fillStyle = "#0E1430";
      ctx.font = `700 40px ${F}`;
      ctx.fillText(card.name, 300, 200);
      ctx.fillStyle = "#475569";
      ctx.font = `400 18px ${F}`;
      ctx.fillText(card.university, 300, 226);
      ctx.fillStyle = "#64748B";
      ctx.font = `600 18px ${F}`;
      ctx.fillText("AGE CATEGORY", 300, 250);
      ctx.fillStyle = "#15803D";
      ctx.font = `700 40px ${F}`;
      ctx.fillText(card.ageCategory ?? "—", 300, 292);
      ctx.fillStyle = "#64748B";
      ctx.font = `600 18px ${F}`;
      ctx.fillText("SPORTS", 300, 336);
      ctx.fillStyle = "#0F172A";
      ctx.font = `500 24px ${F}`;
      card.sports.slice(0, 4).forEach((sp, i) => ctx.fillText(sp, 300, 370 + i * 32));
      ctx.fillStyle = "#0E1430";
      ctx.font = `600 34px ${M}`;
      ctx.fillText(card.sportsId, 36, 560);
      ctx.fillStyle = "#64748B";
      ctx.font = `400 18px ${F}`;
      ctx.fillText(`Valid until ${card.validUntil} · Verify by scanning the QR`, 36, 600);
      const qr = await loadImg(card.qrDataUrl);
      ctx.drawImage(qr, W - 316, H - 316, 280, 280);
      const a = document.createElement("a");
      a.download = `sports-id-${card.sportsId}.png`;
      a.href = c.toDataURL("image/png");
      a.click();
    } catch {
      toast.error("Couldn't create the PNG", "Try the PDF download instead.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Alert tone="warning">{error}</Alert>;
  if (!card) return <Skeleton className="aspect-[1.586] w-full max-w-md" />;

  return (
    <div className="space-y-4">
      <figure aria-label={`Sports ID card for ${card.name}`} className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-white text-[#0f172a] shadow-card">
        <div className="bg-[#fff8f0] px-4 py-3 text-[#0e1430]">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img src="/brand/sports-sphere-logo.png" alt="" className="size-11 shrink-0 rounded-full bg-white ring-1 ring-slate-200" />
            <div className="min-w-0">
              <p className="font-heading text-lg leading-tight font-extrabold uppercase italic">
                Sports <span className="text-[#e4572a]">Sphere</span>
              </p>
              <p className="text-small text-[#475569]">Sports ID · {card.meetName}</p>
            </div>
          </div>
        </div>
        <div className="h-1.5 bg-[#ee7a2b]" />
        <div className="grid grid-cols-[88px_1fr] gap-3 p-4 sm:grid-cols-[104px_1fr_auto]">
          {card.photoDocId ? (
            // eslint-disable-next-line @next/next/no-img-element -- authorised private route
            <img src={`/api/documents/${card.photoDocId}`} alt={`Photo of ${card.name}`} className="aspect-[3/4] w-full rounded-lg object-cover" />
          ) : (
            <div className="aspect-[3/4] w-full rounded-lg bg-slate-200" />
          )}
          <div className="min-w-0">
            <p className="font-heading text-xl leading-tight font-bold text-[#0e1430]">{card.name}</p>
            <p className="text-small text-[#475569]">{card.university}</p>
            <p className="mt-2 text-small font-semibold text-[#475569]">AGE CATEGORY</p>
            <p className="font-mono text-xl font-semibold text-[#166534]">{card.ageCategory}</p>
            <p className="mt-2 text-small font-semibold text-[#475569]">SPORTS</p>
            <ul className="text-small">
              {card.sports.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
          <img src={card.qrDataUrl} alt={`QR code for Sports ID ${card.sportsId}`} className="col-span-2 mx-auto size-40 sm:col-span-1 sm:size-32 sm:self-end" />
        </div>
        <figcaption className="flex flex-wrap items-center justify-between gap-x-3 border-t border-slate-200 px-4 py-2">
          <span className="font-mono font-semibold whitespace-nowrap text-[#0e1430] tabular">{card.sportsId}</span>
          <span className="text-small text-[#475569]">Valid until {card.validUntil}</span>
        </figcaption>
      </figure>
      <div className="flex flex-wrap gap-2">
        <a href="/api/student/id-card?format=pdf" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 font-semibold text-accent-fg hover:bg-accent-hover" download>
          <FileDown className="size-4" aria-hidden /> Download PDF
        </a>
        <Button variant="outline" onClick={downloadPng} loading={busy} icon={<ImageDown className="size-4" aria-hidden />}>
          Download PNG
        </Button>
      </div>
      <p className="flex items-center gap-1.5 text-small text-muted">
        <Download className="size-4" aria-hidden /> Show this on your phone at the venue. The QR code is signed and checked live, so a copied or edited card won&apos;t pass.
      </p>
    </div>
  );
}
