# Sports Sphere — Sports Registration Portal

Sports Sphere is a paperless sports registration portal for inter-university games in India. The host university is configurable with `NEXT_PUBLIC_UNIVERSITY_NAME` (default "Host University"). Students from the university, from other universities, and international students register online. Their identity and age come from verified sources, never from what they type. Officials measure height and weight at a desk, and approved athletes get a signed QR Sports ID that is checked live at venues.

> **Demo system.** Every person, number and document in the seed data is fictional. DigiLocker, OTP delivery, the university ERP, passport MRZ verification and the international admissions office are **mocked** (see [Replacing the mocks](#replacing-the-mocks-with-real-services)).

## Quick start

Requirements: Node.js 20+ (tested on 24) and npm 10+.

```bash
npm install            # also generates the Prisma client
cp .env.example .env   # then set NEXTAUTH_SECRET and QR_SIGNING_SECRET (openssl rand -base64 32)
npm run setup          # creates the SQLite DB and loads fictional seed data
npm run dev            # http://localhost:3000
```

* npm 11 blocks dependency install scripts unless they are approved. The required ones (Prisma, esbuild) are already listed under `allowScripts` in `package.json`.
* If port 3000 is busy, run `npm run dev -- -p 3100` and set `NEXTAUTH_URL` to match.
* `npm run db:reset` wipes the database and reseeds it. Prisma asks for confirmation because it is destructive.
* Production: `npm run build && npm start`, with `DEMO_MODE="false"`.

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint, `tsc --noEmit` |
| `npm run setup` | `db push` + seed (safe on a fresh DB) |
| `npm run db:seed` | Clears all tables and uploads, then loads demo data |
| `npm run db:reset` | Force-resets the schema and reseeds |

## Demo accounts (all fictional)

**Staff** (`/staff/login`; the login page also has tap-to-fill buttons in demo mode)

| Role | Email | Password |
|---|---|---|
| Admin | admin@sportssphere.example | Admin@12345 |
| Second admin (approves DOB corrections) | admin2@sportssphere.example | Admin2@12345 |
| Official | official@sportssphere.example | Official@12345 |
| Medical | medical@sportssphere.example | Medical@12345 |
| Coach (Football) | coach@sportssphere.example | Coach@12345 |

**Students** sign in with an OTP on `/status`. In demo mode the OTP is shown on screen in a box labelled "Demo OTP".

| Test case | How to reach it |
|---|---|
| Approved, with QR Sports ID | Aarav Kulkarni, mobile `7000010001` |
| DOB mismatch (flagged) | Rohan Deshmukh, `7000010002` |
| Name mismatch (flagged) | Sneha (Patil in the ERP / Jadhav on DigiLocker), `7000010003` |
| Under 18, pending | Kavya Iyer, `7000010004` |
| Outside student awaiting college confirmation | Nikhil Sawant, `7000020001` |
| International, waiting for desk passport check | Sujan Thapa Magar, email `sujan.thapa@intl.sportssphere.example` |
| Duplicate attempt | Register as an outside student and use DigiLocker Aadhaar `0000 1000 0001` (already Aarav's) |
| Fresh DOB mismatch for a walkthrough | PRN `SS24EE005` (Vikram) |

Fictional Aadhaar numbers start with `0000`, a prefix UIDAI never issues. Each screen has a **Demo helper** panel that lists the test PRNs, Aadhaar numbers and passports (with valid MRZ lines).

## How it works

```
DRAFT ──submit──▶ PENDING ──desk verify──▶ VERIFIED ──admin approve──▶ APPROVED (QR issued)
   │  (auto-check mismatch)  ▲                                    
   └────────▶ FLAGGED ───────┘ admin "Resolve flag"      any submitted status ──▶ REJECTED / FLAGGED (reason shown to student)
```

* **One identity standard for every Indian student** (host university or any other). The date of birth comes from a Government source and is then locked:
  * **DigiLocker** (fastest), or **Aadhaar Offline e-KYC** (the student uploads UIDAI's signed file with its share code). Both are verified instantly.
  * **Government ID, checked at the desk**, for students who can't use either (for example, no mobile linked to their Aadhaar). The student types the details and uploads a photo of an Aadhaar card, passport, PAN, driving licence or voter ID. The DOB is locked but **not trusted**: the one-person-one-profile key is only set, and the registration can only be marked VERIFIED, after an official ticks "ID document verified" at `/desk` having seen the original (`confirmIdentityDocument` in `src/lib/registration.ts`).
  * Host-university students' details are also compared with the university record as an extra check, never as a substitute. International students use the passport + MRZ check.
  * Students only see the routes that genuinely work (`verificationOptions()` in `src/services/index.ts`). Today DigiLocker and Offline e-KYC are demo mocks, so outside demo mode only the Government ID route is offered until a real implementation is wired in. The real Offline e-KYC check must be written against UIDAI's official specification and tested with genuine files.
* After that the DOB stays locked. Coaches, officials and students can never change it. An admin can only **propose** a correction with a reason, and it takes effect when a **different admin** approves it. Both names, the old and new values and the reason go to the audit log. On approval the age category is recalculated, and if the athlete is no longer eligible for an event, the registration is flagged.
* **Fake-age detection.** At submission, a profile with the same name, Aadhaar last 4 and gender as an existing profile but a different DOB is flagged (`SAME_PERSON_OTHER_DOB`), and the other profile's audit log notes it. Coaches, officials and medical staff can raise an **age concern** (by Sports ID). It never changes the athlete's status by itself: an admin checks original documents and upholds it (the registration is flagged) or dismisses it.
* **Event limits.** Each event can have an entry limit, a minimum squad size and an age limit (e.g. "U-23 only"), set in Settings → Sports. Students only see events they're eligible for, and full events are refused.
* **After submission** students can withdraw from an event immediately, or request a change, which an admin approves or declines after eligibility and places are re-checked.
* **Admin tools.** `/admin/sports` shows entries per sport, event and weight class, split by gender, age category and approval, with every number linking to that list. It also has entry-limit and squad-size warnings, a college summary, an "approved but not match-ready" list and printable **entry sheets**. `/admin/ready` bulk-approves verified records that have no failed checks and no open concern. The student list sorts flagged records first and filters by gender, age category, event and weight class.
* **Two admins at once.** An open record shows "X is reviewing this record" to other admins. Every action carries the record's version, so if someone else acted first the action is refused with "record changed, refresh".
* **Age category** (U-19/U-21/U-23/Open) is computed from the verified DOB on the cutoff date set in Settings.
* **Height and weight** are entered only at `/desk` by an Official or Admin, and stored with who measured them and when (history kept). Weight-category sports (wrestling, boxing, judo, weightlifting) also have per-event **weigh-ins**, flagged as within or outside the declared category.
* **One person = one profile.** `identityKey` is a unique hash of masked Aadhaar (last 4) + normalised name + a DOB hash, or of nationality + passport number. A collision is blocked and audited.
* **Auto-checks.** Path A compares ERP vs DigiLocker name and DOB. Path C compares passport vs admissions-record DOB and name, and validates the ICAO 9303 MRZ check digits. A mismatch means the registration is FLAGGED on submit, with a readable reason.
* **Outside students** stay PENDING until an admin uses "Confirm college". After that the college is saved as trusted.
* **QR Sports ID.** The payload is `SRP1:<sportsId>:<HMAC>`. A scan is VALID only if the signature checks out **and** the athlete is APPROVED right now, so flagging someone revokes their QR instantly.

## Running the competition

After registration, the same verified data runs the event itself:

* **Campuses & schools** (Settings). Host-university students get their school from the ERP's school code, so nobody can claim another school to join its squad.
* **Format builder** per event (Admin → Competition → event): league, knockout or ranked results (times and distances), with periods, minutes, shoot-out, points for a win or draw, and squad size.
* **Teams** for team sports. Only **approved** athletes registered for that event can be added. A school squad only takes that school's students, and a player can be in one squad per event. Teams have a captain and a roster lock.
* **Fixtures**: league pairings, or a seeded knockout bracket with byes (wrestling, boxing and judo get one per weight class). Each round is timetabled from the event date.
* **Live scoring** at `/score` for officials, built for a phone at the ground. Each tap is saved on the device and sent when there's signal. The server ignores duplicates, so a lost connection never loses or double-counts a point.
* **Results**: standings update automatically, knockout winners move on, and admins confirm the podium (joint bronze allowed). The **medal tally** counts by school or college.
* **Certificates**: participation for every approved athlete and medal certificates for the podium. They are PDFs with a QR code linking to the public `/verify/<code>` page, which recomputes an HMAC signature and shows *authentic*, *revoked* or *failed signature check*. Every check is logged.
* **Public results** at `/events`: live scores (auto-refresh), schedule, standings, podium and medal tally. Only names and institutions are shown, never IDs, ages or contact details.
* **Announcements** to everyone, all athletes, one event's athletes, captains, officials, coaches or medical staff. They appear in the portal, with optional SMS and WhatsApp through `MessagingService` (simulated, like OTP).
* **Athletes' "My games"** on `/status`: teams, next matches, results, medals and certificate downloads, with share-able verify links.

Demo data includes a football league in progress (one match live), a finished badminton knockout and a finished 100 m with times, with certificates issued.

## Security & privacy

* Every page **and** every API route checks the role server-side (`src/lib/rbac.ts`). `src/middleware.ts` is an extra first layer. Staff are re-checked against the database on each request, so deactivation takes effect immediately.
* Uploads go to `./uploads` (or `UPLOAD_DIR`), which is outside `/public`. They are served only by `/api/documents/[id]` after an ownership or role check (`DOC_ACCESS` in `src/lib/constants.ts`), and **every view is audited**. File type is checked by magic bytes, with a 5 MB limit. Images are compressed in the browser first.
* bcrypt staff passwords, rate-limited login (5 per 15 min), OTP send (3 per 10 min per target) and OTP verify (5 attempts). OTP codes are stored only as HMACs.
* Certificate PDFs download only for their owner or an admin. Anyone can verify a code, but the verify page shows only what is printed on the certificate.
* Only the last 4 Aadhaar digits are stored. CSV export excludes medical data and guards against spreadsheet formula injection. The default export also leaves out DOB and masks mobile and email. A **full export** needs a written reason. Every export and entry-sheet print is logged.
* DPDP Act: privacy notice at `/privacy`, a "Request data deletion" button on `/status`, an admin deletion queue, and a retention purge (Settings). Deletion erases files and the profile, and redacts the name in the audit log.

## Folder structure

```
prisma/
  schema.prisma          portable schema (SQLite ⇄ PostgreSQL)
  seed.ts                fictional demo data + test cases
  sports-catalog.ts      15 sports, events, weight classes
scripts/prisma-provider.mjs   sets the datasource provider from DATABASE_URL
src/
  app/
    (site)/              public + student pages: /, /register, /status, /privacy, /staff/login, /forbidden
    (staff)/             staff shell: /admin, /admin/students/[id], /admin/audit, /admin/settings, /desk, /scan, /medical, /coach
    api/                 route handlers (auth, otp, register/*, uploads, documents, student/*, admin/*, desk/*, scan)
  components/            ui/ (design system), layout/, register/ (wizard + steps), status/, admin/, desk/, scan/, staff/
  lib/                   auth, rbac, audit, workflow (status rules), registration, submission, eligibility,
                         qr, id-card, mrz, otp, rate-limit, storage, settings, validation/ (shared Zod schemas)
  services/
    types.ts             interfaces for every external system
    index.ts             service registry: the ONLY place that picks implementations
    mock/                mock implementations + fictional data
uploads/                 private files (git-ignored)
```

## How host-university students sign in

Students at the host university (e.g. MIT-WPU) can use any of these:

| Method | How it works |
|---|---|
| **University Google account** (optional) | "Continue with your university Google account" on `/register` and `/status`. The student signs in on Google's own page with their university email and password; the portal never sees the password. Only Google-verified accounts on a configured university domain are accepted (`src/lib/university-sso.ts`). **Host university** (`UNIVERSITY_EMAIL_DOMAIN`): matched to the student record via `ErpService.findStudentByEmail`; a draft is created from the university records on first sign-in. **Visiting universities** (`PARTNER_UNIVERSITY_DOMAINS`, e.g. `COEP Pune:coeptech.ac.in`): the account verifies the student's email and university; identity is then checked in the normal outside-student flow. |
| **PRN** | `/register` step 1 and the PRN tab on `/status`. A one-time code goes to the mobile or email held in the university records, never one the student types. |
| Mobile / email | The code goes to the contact verified at registration (all students). |

MIT-WPU's email runs on Google Workspace (`mitwpu.edu.in` mail is handled by Google). To switch on Google sign-in, the university's Workspace admin creates an OAuth client (type **Internal**) in Google Cloud. The redirect URI is `<NEXTAUTH_URL>/api/auth/callback/google`. Then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `UNIVERSITY_EMAIL_DOMAIN="mitwpu.edu.in"`. The button stays hidden until all three are set. The portal never asks for a student's ERP password. Signing in with ERP (PRN + password) directly would need the university to provide single sign-on for the ERP (SAML or OpenID Connect).

## Replacing the mocks with real services

Each external system has an interface in `src/services/types.ts`. Write a real class that implements it, then change the one line that wires it up in **`src/services/index.ts`**. Nothing else needs to change.

| Interface | Mock file | Replace with |
|---|---|---|
| `ErpService` | `src/services/mock/erp.ts` | University ERP API (student by PRN, photo) |
| `AadhaarOfflineService` | `src/services/mock/aadhaar-offline.ts` | Real check of UIDAI's Offline e-KYC ZIP: open it with the share code, verify UIDAI's XML signature against UIDAI's published certificate, read details only from the signed content. Build against UIDAI's official specification and genuine sample files. |
| `DigiLockerService` | `src/services/mock/digilocker.ts` | DigiLocker Partner API (OAuth 2.0 + e-Aadhaar XML + issued documents). With the real OAuth redirect flow, `startConsent` returns the authorisation URL and `completeConsent` exchanges the code. The UI in `src/components/register/digilocker-dialog.tsx` then becomes a redirect instead of a modal. |
| `OtpDeliveryService` | `src/services/mock/otp-delivery.ts` | SMS gateway (DLT-registered template) + transactional email |
| `PassportVerificationService` | `src/services/mock/passport.ts` | MRZ/NFC passport reader SDK at the desk, or a document-verification provider. `src/lib/mrz.ts` already implements real ICAO check digits. |
| `InternationalAdmissionsService` | `src/services/mock/admissions.ts` | International admissions office system |

Also remove `src/services/mock/demo-hints.ts` and `/api/demo/hints` (they are already disabled when `DEMO_MODE="false"`).

**Switching to PostgreSQL:** set `DATABASE_URL="postgresql://…"` in `.env` and run `npm run db:push`. `scripts/prisma-provider.mjs` rewrites the provider automatically. The schema uses only portable features, with enums stored as strings.

**Scaling out:** the rate limiter (`src/lib/rate-limit.ts`) and the DigiLocker mock state are in-memory. Use Redis when running more than one instance. `src/lib/storage.ts` can be swapped for S3/GCS (private bucket).

## Decisions & assumptions

* Students choose their **weight category** when registering. The official weigh-in then checks it.
* Gender is taken from the verified source and is read-only. Events are filtered by gender.
* Auto-check mismatches are shown immediately, but the status changes to FLAGGED **on submit**. That way the student can still complete the form.
* Approve requires VERIFIED. Verify requires a measurement, a confirmed college (outside students) and the desk passport tick (international students). A flagged registration must be resolved by an admin before desk verification.
* Admins see everything except declared medical conditions (medical staff only). Coaches see only approved players in their own sport, and no ID or medical documents.
* **Branding ("Light & warm").** The colours come from the official Sports Sphere logo (`public/brand/sports-sphere-logo.png`, also used as the favicon and on the ID card). Surfaces are white/cream, like the logo. The logo's navy ink `#0E1430` is used only for text and small solid elements (selected chips, secondary buttons). Primary buttons are logo orange `#EE7A2B` with navy text (6.4:1). Icon tiles and the active nav item use a soft orange tint (`#FFF1E6` / `#C2410C`). The "SPHERE" orange gradient is used for large headline text. The logo's ring colours (red, orange, yellow, green, water blue) appear in the header stripe and hero arcs. Charts use orange `#E8590C`. Dark mode is neutral charcoal (no blue tint). Sports IDs look like `SS-26-XXXXXX`. All tokens are in `src/app/globals.css`. **Replace the logo PNG with a high-resolution version (≥600 px or SVG) for a crisp hero.**
* **Fonts** (Google Fonts via `next/font`): **Lato** 400/700/900 (+ italic for the logo-style wordmark) for headings, body and form text. Lato is the digital typeface in the MIT-WPU Brand Book 2026 (p.12), and the official website uses it too. **JetBrains Mono** is kept for IDs, PRNs and measurements. The PDF ID card and certificates embed the same Lato files from `assets/fonts/` (SIL Open Font Licence, `OFL.txt`) through `src/lib/pdf-fonts.ts`, and fall back to Helvetica if the files are missing.
* Each student may enter at most 4 events. The age cutoff defaults to 1 Dec 2026 and retention to 365 days (both editable).
