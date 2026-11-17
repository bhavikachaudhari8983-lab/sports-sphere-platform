// DEMO ONLY: emails are written to the server log instead of being sent.
import type { EmailService } from "../types";

export const mockEmailService: EmailService = {
  async send({ to, subject }) {
    console.log(`[demo email] to ${to.replace(/(^.).*(@.*$)/, "$1•••$2")}: ${subject}`);
    return "DEMO";
  },
};
