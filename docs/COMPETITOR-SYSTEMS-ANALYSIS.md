# MIT-WPU systems: technical investigation

**Date:** 17 Nov 2026
**Scope:** passive, read-only investigation of publicly served resources only (HTML, client JS, HTTP headers, robots/sitemap/manifest, and the redirect behaviour of protected routes). No authentication was attempted, no payloads were sent, no data was altered. Active security testing (auth bypass, injection, fuzzing, credential testing, hidden-endpoint enumeration) was **not** performed, because it needs written authorization from MIT-WPU IT. Items needing that access are listed as "requires authorization", never guessed.

Two systems:
1. **`cas.mitwpu.edu.in`** — the university's Central Authentication Service (single sign-on / login).
2. **`sports.mitwpu.edu.in`** — "MIT-WPU Courtside", a sports-facility slot-booking app.

---

## 1. CAS — Central Authentication Service

### Technology stack (verified from public responses)
| Layer | Evidence | Conclusion |
|---|---|---|
| Server framework | `x-powered-by: ASP.NET`; `__VIEWSTATE`, `__VIEWSTATEGENERATOR`; `WebResource.axd`, `ScriptResource.axd`; `.aspx` pages | **ASP.NET Web Forms** (classic .NET Framework, not .NET Core). Server-rendered postback model. |
| Session | `Set-Cookie: ASP.NET_SessionId=…; Secure; HttpOnly; SameSite=Lax` | Stateful server-side session. |
| Client libraries | `jquery.min.js`, `bootstrap.bundle.min.js`, `jquery-ui.js` | jQuery + Bootstrap 5 + jQuery UI. |
| Anti-bot | `recaptcha/api.js`, `.g-recaptcha`, sitekey `6LeGBxIsAAAAAIMbJySNUHvyCIwUtjjk76517hHT`; also an image-captcha box in CSS (`.captcha-box img`) | Google reCAPTCHA v2, possibly plus an image captcha. |

### Login form (verified)
- Visible fields: `txtUserId` (Username), `txtPassword` (Password), `btnLogin`, `btnreset` (reset).
- Hidden fields: `hdtype`, `hdloginid`, `hdnFlag`, `hdnMsg`, `hdnWCCSOTP`. The `hdnWCCSOTP` field strongly implies an **OTP** step exists (one-time password), toggled server-side.
- "Forgot Password" link present.
- Form posts back to itself (`action="./"`, classic Web Forms postback).

### Other referenced pages (seen in public markup, not fetched)
`AdminLogin.aspx`, `adminlogin_.aspx`, `Changepassword.aspx`, `frmForgetPassword.aspx`, `ForgotPassword`, `main_.aspx`, `newloginpage.aspx`, `wpu_log.aspx`. These indicate separate admin login, change-password and forgot-password flows.

### Observable architecture
```
Browser ──HTTPS──▶ IIS / ASP.NET Web Forms (cas.mitwpu.edu.in)
   │  POST (ViewState + userId + password + reCAPTCHA + optional OTP)
   ▼
Server validates → sets ASP.NET_SessionId → (SSO) issues a ticket/redirect back to the requesting app
```
This is the identity provider that other MIT-WPU systems (ERP, etc.) delegate login to. The exact SSO protocol (a CAS-style ticket, SAML, or a custom redirect) is **not** observable without seeing a real app → CAS → app round-trip (requires authorization).

### Security posture (from public headers — good)
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Frame-Options: SAMEORIGIN` + `Content-Security-Policy: frame-ancestors 'self'`
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- Session cookie is `Secure; HttpOnly; SameSite=Lax`.
- reCAPTCHA on login.

### Requires authorization to assess (do not assume these are flawed)
- **ViewState protection.** Web Forms apps must have ViewState MAC + encryption on and the `machineKey` kept secret; a leaked key enables ViewState deserialization attacks. Cannot be verified from outside.
- Account lockout / rate limiting / password policy on login, change-password and forgot-password.
- Whether every admin/login `.aspx` variant has the same hardening (reCAPTCHA, OTP, headers).
- OTP delivery and validation logic.

---

## 2. Courtside — sports facility booking

Full product name (from manifest): **"MIT-WPU Courtside: Sports Facility Automation System."**

### Technology stack (verified)
| Layer | Evidence | Conclusion |
|---|---|---|
| Frontend | RSC streaming payload (`self.__next_f.push`), `(auth)` route group, `/_next/static/immutable/chunks/…`, a `turbopack-…js` chunk | **Next.js** App Router (React Server Components), built with Turbopack. |
| Hosting | `server: Vercel`, `x-vercel-id: bom1::…` | **Vercel**, Mumbai (bom1) region. |
| Backend / DB | CSP `connect-src 'self' https://*.supabase.co https://*.supabase.in … wss:` | **Supabase** (hosted Postgres + Auth + Realtime over WebSocket). |
| UI | Tailwind utility classes; `next-themes` (class strategy, system default); `sonner` Toaster; Geist + Geist Mono fonts | Tailwind + a shadcn/ui-style component set. |
| PWA | `manifest.webmanifest`, `display: standalone`, service worker (`worker-src 'self' blob:`), full icon set, app shortcuts | Installable Progressive Web App. |
| Analytics | `Analytics`, `SpeedInsights` components | Vercel Analytics + Speed Insights. |

### Authentication & roles (verified)
- **Supabase Auth, email + password.** Login page: Email + Password + "Forgot your password?". Signup page: Email + Create Password + Confirm Password.
- Restricted to **college email** ("Enter your college email", `@mitwpu.edu.in`). Account ownership is proven by email confirmation (standard Supabase flow).
- Audience: **students and faculty** (manifest/SEO text); an **admin** area exists (`/admin`).
- No SSO link to the CAS above was observed — Courtside appears to run its **own** Supabase-based login, separate from the university CAS. (Worth noting for your own project: the two MIT-WPU systems don't share a login.)

### Features (from manifest, sitemap, robots, SEO keywords)
- `/sports` — browse & book a facility (basketball, badminton, football courts…).
- `/my-bookings` — manage your bookings.
- `/profile`, `/notifications`.
- `/assistant` — an **AI assistant** ("get AI help when needed").
- `/club`, `/admin`.
- **QR scanner** (SEO keyword + `permissions-policy: camera=*`) — almost certainly for check-in/verification at the venue.
- **Real-time booking** ("check availability instantly", `wss:` in CSP) — Supabase Realtime over WebSocket pushes live slot availability.

### Observable architecture
```
Browser / installed PWA
   │
   ├─ Next.js app on Vercel (SSR + RSC + middleware)
   │     • middleware guards routes: unauthenticated → 307 /login
   │     • server actions / route handlers talk to Supabase with the user's session
   │
   └─ Supabase (direct from browser with anon key + user JWT, and/or via server)
         • Auth  (email/password, JWT)
         • Postgres (facilities, slots, bookings, profiles, roles) — guarded by Row-Level Security
         • Realtime (WebSocket) → live slot availability
```

### Route protection (verified, read-only GETs)
`/dashboard`, `/admin`, `/bookings`, `/profile` all return **307 → /login** when unauthenticated. `robots.txt` also disallows `/admin/`, `/api/`, `/sports/`, `/my-bookings/`, `/profile/`, `/notifications/`. Access control at the routing layer is working.

### Security posture (from public headers)
Good:
- Strong CSP with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`.
- `X-Frame-Options: DENY`, HSTS `max-age=63072000; preload`, `nosniff`, `X-XSS-Protection`, referrer-policy.
- Route-level auth redirects.

Observations worth tightening (factual, from the headers themselves — not exploits):
1. **`script-src` includes `'unsafe-inline' 'unsafe-eval'` and a blanket `https:`.** This substantially weakens the CSP against XSS. The RSC payload shows `nonce: $undefined`, confirming no nonce is in use. Next.js supports nonce-based CSP; moving to it would make the CSP meaningful. `connect-src` and `img-src` also allow any `https:`.
2. **`permissions-policy: camera=*`** grants camera to any context. Framing is already blocked, so risk is low, but `camera=(self)` is tighter and still works for the QR scanner.

### Requires authorization to assess (the important one for a Supabase app)
- **Row-Level Security (RLS) policies.** In a Supabase app the anon key is public *by design*; data safety depends entirely on RLS being correct on every table (bookings, profiles, roles, facilities). A single missing policy can expose or let users modify others' data. **This is the #1 thing to verify**, and it can only be checked with the Supabase project or explicit permission — not from outside.
- Server actions / route-handler input validation, booking business rules (double-booking, slot limits), admin authorization checks, rate limits, and whether email confirmation is enforced before booking.

---

## 3. Side-by-side

| | CAS (`cas`) | Courtside (`sports`) |
|---|---|---|
| Purpose | University-wide login / SSO | Sports facility booking |
| Era / stack | ASP.NET **Web Forms** (legacy, server postback) | **Next.js + Supabase** (modern, serverless) |
| Hosting | University IIS server | Vercel (Mumbai) |
| Rendering | Server-rendered postbacks (ViewState) | React Server Components + client hydration |
| Auth | Custom ASP.NET, userId + password + reCAPTCHA + OTP | Supabase Auth, college email + password |
| State | Server session (`ASP.NET_SessionId`) | JWT (Supabase), stateless |
| Realtime | None observed | Supabase Realtime (WebSocket) |
| Data access | Server-side only | Browser↔Supabase (RLS-guarded) + server |
| Extras | — | PWA, AI assistant, QR scanner, Vercel analytics |
| Security headers | Good | Good (CSP could use nonces) |

### What to learn from each
- **CAS** is the pattern for a central identity provider: one hardened login, reCAPTCHA + OTP, strict headers, server sessions. Its weakness is the legacy Web Forms/ViewState base.
- **Courtside** is a clean modern template for exactly the kind of thing you're building: Next.js on Vercel + Supabase (Auth + Postgres + Realtime), PWA for phone install, real-time availability, QR check-in, an admin area, and an AI helper. It's the closest public comparison to the Sports Sphere registration portal.

### Courtside vs the Sports Sphere portal you're building
| Capability | Courtside | Your portal |
|---|---|---|
| Framework | Next.js + Supabase (managed) | Next.js + Prisma (self-hosted DB, swappable Postgres) |
| Login | Email + password | PRN + OTP, verified mobile/email, optional university Google SSO |
| Identity verification | Email ownership only | DigiLocker / ERP / passport, locked DOB, anti-fake-age |
| Realtime | Supabase Realtime (built in) | Planned (SSE) in the tournament design |
| Scope | Facility booking | Registration + verification + tournament + live scoring |

Courtside solves a **smaller** problem (booking a court) with a managed backend. Your portal solves a **larger** one (verified identity, competition, scoring). The one thing worth copying from Courtside is its **real-time layer** and **PWA install** — both already in your tournament design doc.

### To build a similar booking system independently
Next.js (App Router) on Vercel + Supabase (Auth with an email-domain allow-list, Postgres with **carefully written RLS**, Realtime for live slots), Tailwind + shadcn/ui, a PWA manifest + service worker, and route middleware for auth. The hard parts are not the UI — they are **correct RLS** and **booking concurrency** (two people grabbing the same slot), which need transactional/constraint-level handling in Postgres.

---

## Verified vs. not

**Verified (public observation):** both tech stacks, hosting, Courtside's Supabase/Realtime/PWA, both auth methods and fields, Courtside's feature list and route protection, all HTTP security headers, CAS's OTP/reCAPTCHA/admin-page existence.

**Not established (needs source access or written authorization):** exact API endpoints and payloads, database schemas, Courtside's RLS policies, CAS's SSO protocol and ViewState/lockout config, server-side validation and business logic, rate limits. None of this was probed.
