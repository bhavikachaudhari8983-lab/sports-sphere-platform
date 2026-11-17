# Master implementation checklist

Last updated: 17 Nov 2026. Status reflects **tested** behaviour only: ✅ Complete · 🟡 Partially complete · ⬜ Not started · 🔴 Broken.
Integrations waiting on credentials are marked 🔑. They are built to plug in, but switched off until the keys exist.

| # | Module | Status | What exists (tested) | What's missing |
|---|---|---|---|---|
| 1 | Public tournament discovery | 🟡 | Home shows tournaments open for registration, live, next and recent matches (real data) | Tournament list page with search and filters (D3) |
| 2 | Tournament details | ⬜ | — | Public page per tournament with tabs (D3) |
| 3 | User authentication | ✅ 🔑 | Staff email + password (rate-limited); students: PRN code, mobile/email code; roles checked on the server | 🔑 Google sign-in needs MIT-WPU's keys; 🔑 real SMS/email codes need a provider |
| 4 | Participant profiles | 🟡 | My account: status, reference number, ID card, messages, games, medals, certificates | Participation history across tournaments; editable contact details |
| 5 | Individual registration | ✅ | 7-step wizard, autosave, eligibility, registration window, duplicate and fake-age checks | "Choose tournament" first step (D4) |
| 6 | Team registration | 🟡 | Admin builds school/college squads from approved athletes, captain, squad lock | Team managers registering their own squad (Phase 2) |
| 7 | Document verification | ✅ 🔑 | Uploads (type-sniffed, private), desk check of original ID or passport, flags with reasons | 🔑 DigiLocker / Aadhaar Offline e-KYC need approval or spec; ERP lookup needs IT |
| 8 | Registration approval | ✅ | Desk verify → approve → QR; bulk approve; flag, reject, reopen; two-admin DOB correction; notifications | — |
| 9 | Tournament configuration | 🟡 | Tournaments with dates, registration window, status; events assigned to tournaments | Description, rules text and eligibility shown publicly; tournament closure |
| 10 | Sports and categories | ✅ | Sports, events, gender, age categories, weight classes, entry limits, squad sizes | — |
| 11 | Fixture generation | 🟡 | League (round robin), knockout with byes, per weight class | Group stage → knockout, Swiss, heats → final (Phase 3) |
| 12 | Match scheduling | ✅ | Auto timetable; per-match date, time, court and length; clash checks (same court, same team or athlete incl. across events, same official); postpone / cancel (league only) / reinstate with a public reason; reschedule; overwrite guard | Notify teams when a match moves (with item 20) |
| 13 | Venue allocation | ✅ | Venues and courts (admin page), close or re-open a court, court per match, court shown to spectators | Auto-scheduler that fills courts (Phase 3) |
| 14 | Officials and scorers | ✅ | Scorer and referee per match, official clash check; officials see and score only their own matches (page and API); admins can score any match | Referee confirms results (with item 16) |
| 15 | Live scoring | 🟡 | Phone scoring, offline queue, duplicate-proof taps, finish guard | Sport-specific scoring screens; push updates (Phase 4) |
| 16 | Match results | 🟡 | Result entry, walkovers, tiebreaks, overwrite protection | Referee confirmation step; corrections with reasons |
| 17 | Tournament standings | ✅ | League tables (points, goal difference), auto-updated | Sport-specific tie-break rules |
| 18 | Knockout brackets | 🟡 | Winners advance automatically; rounds listed | Visual bracket view |
| 19 | Leaderboards | 🟡 | Medal tally by institution | Player statistics and leaderboards (Phase 5) |
| 20 | Notifications | ✅ 🔑 | In-portal messages and email on submit, approve, reject, flag; announcements by audience | 🔑 Email needs SMTP settings; fixture and result notifications |
| 21 | Certificates | ✅ | Participation and medal PDFs, QR verification page | — |
| 22 | Tournament closure | ⬜ | Podium confirmation per event | Close the whole tournament: final standings, archive, champions page |
| 23 | Reports and analytics | 🟡 | Dashboard numbers; CSV export with masking; audit log | Per-tournament reports |
| 24 | Security and permissions | ✅ | Server-side roles on every page and API, Super Admin, rate limits, private files, audit, DPDP deletion | Role scopes (tournament manager, team manager, scorer) arrive with their modules |
| 25 | Responsive design | 🟡 | Every page works on phones (tested); new design on home | Redesign of the remaining pages (D3–D6) |

## Module log

- **17 Nov 2026: match management (12, 13, 14) done.** 16 rule checks passed, including a real bug found and fixed: a team with an empty squad could be double-booked. Browser checks passed for the organiser (venues, Manage, postpone, reinstate), the spectator (postponed + reason shown) and the scorer (only own matches, turned away elsewhere, API 403). Also fixed: match actions now verify the match belongs to the event in the URL.

## Known intermittent test failures (under investigation, not reproducible on demand)

| Symptom | Seen | Ruled out |
|---|---|---|
| Registration test: the address box keeps only its first letter, so the rest of the registration steps fail | 2 of 6 full test runs (production build) | Autosave overwriting the field (each section keeps its own state); the step reloading (no key change). A focus probe on a later run showed focus stayed on the field and the address typed correctly. The registration suite passes on its own and in 4 of 6 full runs |
| React hydration warning #418 (server and browser drew a page differently) on `/`, `/admin` or `/admin/competition` | 3 of 6 full runs, a different page each time | The theme toggle (uses the safe pattern); the header's sign-in state (consistent first draw). The development server shows no hydration problem on any page, in light or dark mode, signed out, as a student or as an admin |

Neither blocks a user journey in manual or targeted checks. Next step if they persist: record a browser trace during a failing full run.

## Highest-priority incomplete module (when this list was written)

**Match management: venues and courts, scheduling with clash prevention, postpone/cancel, and assigned scorers (items 12, 13, 14).**

Why first: it sits in the middle of the dependency chain.
- Fixtures already exist, but they can't be timed onto real courts or protected from clashes.
- Matches can't be postponed or cancelled.
- Scorers aren't tied to matches, so live scoring (15), results (16), the scorer journey (C) and the organiser journey (B) can't be completed safely.

Public pages (1, 2) only *display* this data, so they come right after.

## Order of work

1. ~~Match management (12, 13, 14)~~ ✅ done.
2. Public tournament discovery and details (1, 2), with the new design.
3. Tournament closure and champions page (22), plus the bracket view (18).
4. Registration: "choose tournament" step; team managers (5, 6).
5. Sport-specific live scoring, referee confirmation, push updates (15, 16), with basketball first for Hoop It Up.
6. Group stages, statistics and leaderboards (11, 19), and reports (23).
