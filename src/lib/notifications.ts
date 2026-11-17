// Personal notices to students: always shown in the portal (My account), and emailed when the student has a verified
// email address and email is configured. Sending never blocks or undoes the action that triggered it.
import { prisma } from "./prisma";
import { audit } from "./audit";
import { APP_NAME } from "./constants";
import { emailService } from "@/services";

export type NotificationKind = "REGISTRATION_SUBMITTED" | "REGISTRATION_APPROVED" | "REGISTRATION_REJECTED" | "REGISTRATION_FLAGGED";
type Message = { title: string; body: string; link?: string };

const baseUrl = () => (process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Short reference shown to the student from the moment they submit (the QR Sports ID comes only on approval). */
export function registrationReference(studentId: string): string {
  return studentId.slice(-8).toUpperCase();
}

function emailHtml(name: string, m: Message): string {
  const link = m.link ? `${baseUrl()}${m.link}` : `${baseUrl()}/status`;
  const paras = m.body.split("\n").filter(Boolean).map((p) => `<p style="margin:0 0 12px">${esc(p)}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Lato,Arial,sans-serif;color:#0e1430">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="margin:0 0 16px;font-weight:900;font-style:italic;font-size:18px">SPORTS <span style="color:#e4572a">SPHERE</span></p>
<div style="background:#fff;border-radius:12px;padding:24px;border-top:4px solid #ee7a2b">
<h1 style="margin:0 0 12px;font-size:20px">${esc(m.title)}</h1>
<p style="margin:0 0 12px">Hi ${esc(name)},</p>${paras}
<p style="margin:20px 0 0"><a href="${esc(link)}" style="background:#ee7a2b;color:#0e1430;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px;display:inline-block">Open My account</a></p>
</div>
<p style="margin:16px 0 0;font-size:12px;color:#64748b">You're receiving this because you registered on ${esc(APP_NAME)}. Sign in at ${esc(baseUrl())}/status.</p>
</div></body></html>`;
}

/** Saves the notice and emails it when possible. Never throws. */
export async function notifyStudent(studentId: string, kind: NotificationKind, m: Message): Promise<void> {
  try {
    const s = await prisma.student.findUnique({ where: { id: studentId }, select: { fullName: true, email: true, emailVerified: true } });
    if (!s) return;
    const n = await prisma.notification.create({ data: { studentId, kind, title: m.title, body: m.body, link: m.link ?? "/status" } });
    if (!s.email || !s.emailVerified) return; // shown in the portal only (SMS later)
    const svc = emailService();
    if (!svc) {
      await prisma.notification.update({ where: { id: n.id }, data: { emailStatus: "NOT_CONFIGURED" } });
      return;
    }
    const name = s.fullName ?? "athlete";
    try {
      const status = await svc.send({ to: s.email, subject: `${m.title} · ${APP_NAME}`, text: `Hi ${name},\n\n${m.body}\n\n${baseUrl()}${m.link ?? "/status"}`, html: emailHtml(name, m) });
      await prisma.notification.update({ where: { id: n.id }, data: { emailStatus: status } });
      await audit({ actor: { type: "SYSTEM" }, action: "NOTIFICATION_SENT", studentId, summary: `Email ${status === "DEMO" ? "(demo, not sent)" : "sent"}: ${m.title}` });
    } catch (e) {
      const error = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      await prisma.notification.update({ where: { id: n.id }, data: { emailStatus: "FAILED", emailError: error } });
      await audit({ actor: { type: "SYSTEM" }, action: "NOTIFICATION_SENT", studentId, summary: `Email FAILED: ${m.title} (${error})` });
    }
  } catch (e) {
    console.error("[notify] could not record notification", e);
  }
}

// ---------- the messages, in plain words ----------
export const messages = {
  submitted: (studentId: string): Message => ({
    title: "Registration received",
    body: `Thank you. Your registration has been submitted.\nYour registration reference is ${registrationReference(studentId)}.\nNext: visit the verification desk with your original ID, where an official records your height and weight. We'll let you know as soon as you're approved.`,
  }),
  submittedFlagged: (studentId: string, reason: string): Message => ({
    title: "Registration received: a detail needs checking",
    body: `Your registration has been submitted (reference ${registrationReference(studentId)}), but some details don't match our records, so the sports office will review it.\n${reason}\nYou don't need to register again. Contact the sports office if you have any questions.`,
  }),
  approved: (sportsId: string): Message => ({
    title: "You're approved",
    body: `Your registration has been approved. Your QR Sports ID is ${sportsId}.\nOpen My account to download your ID card. Show it at venues for check-in.`,
  }),
  rejected: (reason: string): Message => ({
    title: "Registration not approved",
    body: `Your registration was not approved.\nReason: ${reason}\nIf you think this is a mistake, contact the sports office.`,
  }),
  flagged: (reason: string): Message => ({
    title: "Your registration needs attention",
    body: `The sports office has put your registration on hold for a check.\nReason: ${reason}\nOpen My account to see what to do next.`,
  }),
};
