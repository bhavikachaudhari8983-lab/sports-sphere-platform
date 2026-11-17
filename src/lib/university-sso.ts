// "Sign in with your university Google account" — for the host university AND visiting universities.
// Students sign in on Google's own page with the university email + password they already use; this portal
// never sees the password. Only Google-verified accounts on a configured university domain are accepted.
//
// Config (see .env.example). Switched on only when the Google client is set:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   OAuth client (one is enough for every university)
//   UNIVERSITY_EMAIL_DOMAIN                   the HOST university's domain, e.g. "mitwpu.edu.in"
//   PARTNER_UNIVERSITY_DOMAINS (optional)     visiting universities, comma-separated "Name:domain" pairs,
//                                             e.g. "COEP Pune:coeptech.ac.in, SPPU:unipune.ac.in"
// The host is verified against the university records (ERP). A visiting-university account only proves the
// student belongs to that university; identity is still verified later in the normal outside-student flow.

export type SsoUniversity = { name: string; domain: string; isHost: boolean };
export type UniversitySso = { clientId: string; clientSecret: string; universities: SsoUniversity[] };

const norm = (d: string) => d.trim().toLowerCase().replace(/^@/, "");

/** Parses "Name:domain, Name2:domain2" (name optional → derived from the domain). */
function parsePartners(raw: string | undefined): Array<{ name: string; domain: string }> {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const i = part.lastIndexOf(":");
      const name = i > 0 ? part.slice(0, i).trim() : "";
      const domain = norm(i > 0 ? part.slice(i + 1) : part);
      return { name: name || domain, domain };
    })
    .filter((p) => p.domain.includes("."));
}

export function universitySso(): UniversitySso | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const hostDomain = process.env.UNIVERSITY_EMAIL_DOMAIN ? norm(process.env.UNIVERSITY_EMAIL_DOMAIN) : "";
  if (!clientId || !clientSecret || !hostDomain) return null;

  const hostName = process.env.NEXT_PUBLIC_UNIVERSITY_NAME?.trim() || "your university";
  const universities: SsoUniversity[] = [{ name: hostName, domain: hostDomain, isHost: true }];
  for (const p of parsePartners(process.env.PARTNER_UNIVERSITY_DOMAINS)) {
    if (!universities.some((u) => u.domain === p.domain)) universities.push({ name: p.name, domain: p.domain, isHost: false });
  }
  return { clientId, clientSecret, universities };
}

/**
 * The university a Google profile belongs to, or null. Strict: the address must be Google-verified, its
 * hosted domain (`hd`) must equal the matched domain, and the email must end with exactly "@<domain>"
 * (so a look-alike like "x@evilmitwpu.edu.in" never matches).
 */
export function matchUniversity(profile: { email?: string | null; email_verified?: boolean | null; hd?: string | null }, sso: UniversitySso): SsoUniversity | null {
  const email = profile.email?.trim().toLowerCase() ?? "";
  if (profile.email_verified !== true || email.split("@").length !== 2) return null;
  const hd = profile.hd?.toLowerCase() ?? "";
  return sso.universities.find((u) => u.domain === hd && email.endsWith(`@${u.domain}`)) ?? null;
}

/** Only the host restricts Google's account picker to one domain; with partners the picker stays open (verified server-side). */
export function hostedDomainHint(sso: UniversitySso): string | undefined {
  return sso.universities.length === 1 ? sso.universities[0].domain : undefined;
}

/** Button label + example domain for the sign-in UI. */
export function ssoPrompt(sso: UniversitySso): { label: string; exampleDomain: string } {
  const host = sso.universities.find((u) => u.isHost) ?? sso.universities[0];
  return {
    label: sso.universities.length === 1 ? `Continue with ${host.name} Google account` : "Continue with your university Google account",
    exampleDomain: host.domain,
  };
}

/** Error codes shown on /status or /register after a failed university sign-in. */
export const SSO_ERRORS: Record<string, string> = {
  "wrong-domain": "Please use your university Google account (your college email), not a personal Gmail. If your university isn't listed, sign in with your mobile number or email instead.",
  "not-found": "We couldn't find your email in the university student records. Sign in with your PRN instead, or contact the sports office.",
  failed: "University sign-in didn't complete. Please try again, or sign in with your mobile number or email.",
};
