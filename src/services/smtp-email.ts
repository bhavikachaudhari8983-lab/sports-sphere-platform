// Real email over SMTP (works with Google Workspace's SMTP relay or any email provider).
// Configured by SMTP_URL (e.g. smtps://user:password@smtp.example.com:465) and EMAIL_FROM.
import nodemailer, { type Transporter } from "nodemailer";
import type { EmailService } from "./types";

let transport: Transporter | null = null;

export function smtpEmailService(url: string, from: string): EmailService {
  transport ??= nodemailer.createTransport(url);
  return {
    async send({ to, subject, text, html }) {
      // Only plain strings go in: no attachments, file paths or URLs are ever passed to the mailer.
      await transport!.sendMail({ from, to, subject, text, html, disableFileAccess: true, disableUrlAccess: true });
      return "SENT";
    },
  };
}
