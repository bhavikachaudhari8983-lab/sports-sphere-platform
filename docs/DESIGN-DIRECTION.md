# Sports Sphere platform: design direction and experience plan

Status: **proposal, for approval before the visual redesign starts.** Date: 17 Nov 2026.
Scope: the tournament platform in this folder (registration → verification → fixtures → live scoring → results). The separate official marketing website keeps its own design.

**Brand decision (from the owner).** This is MIT-WPU's own Sports Sphere platform, open to students from every university. The design brief asked for a neutral standalone product; that part is overridden. The Sports Sphere name and logo stay, and MIT-WPU appears as the host university.

Related documents: [PLATFORM-ASSESSMENT-AND-ROADMAP.md](PLATFORM-ASSESSMENT-AND-ROADMAP.md) (features and phases) and [TOURNAMENT-SYSTEM-DESIGN.md](TOURNAMENT-SYSTEM-DESIGN.md) (fixtures, scoring, real-time).

---

## 0. Audit: the current interface

| Area | Today | Verdict |
|---|---|---|
| Brand | Logo colours (navy, orange→red, ring of yellow/green/blue), Lato, logo top-left | Keep |
| Look | "Light & warm": cream hero, rounded cards, soft shadows | Reads as a pleasant web app, not yet a **competition** product. Too many identical rounded cards |
| Public home | Hero ("Register. Get verified. Play fair."), sports grid, contact | Registration-centred. Doesn't show live matches, results or tournaments |
| Public results `/events` | Live scores, schedule, standings, podium, medal tally | Strong data, plain presentation. Updates every 15 s |
| Registration wizard | 7 steps, progress bar, autosave, clear errors | Good UX. Missing "choose your tournament" as the first step |
| Status page | Status timeline, ID card, my games, messages | Good. Should become a fuller **participant dashboard** |
| Admin | Sidebar, dashboard with "needs your attention", lists with filters | Functional and clear. Visually the same card style as everything else |
| Scorer `/score` | Big +/− buttons, offline queue | Works. Generic "+1" for every sport |
| Accessibility | Focus rings, labels, skip link, dark mode, 44 px targets | Keep this standard throughout |

**Summary:** the foundations (data, flows, accessibility) are good. The redesign is mostly about:
- presentation: a sharper competition identity, and scoreboards that read like broadcast graphics
- information architecture: tournaments become the centre of the public site

---

## 1. Design direction: "Match-day clarity"

The interface should feel like a stadium scoreboard and a broadcast lower-third: **bold, fast to read, data first.**

- **Data is the hero.** Scores, statuses, times and names get the strongest typography. Decoration never competes with a live score.
- **Navy stage, yellow light.** Deep navy surfaces for anything live or competitive (scoreboards, match centre, finals). White for forms and reading. Electric yellow marks what's happening *now* (live, next up, your action).
- **Hard edges, fewer boxes.** Use dividers, full-width rows and section bands instead of a card around everything. Corners are small (4–6 px). Pills are kept for statuses.
- **Italic for the brand, upright for data.** Heavy italic Lato for headings and the wordmark (as in the logo). Upright, tabular numbers for scores and times so digits don't jump.
- **Motion with meaning only.** A score that changes flashes once. The live dot pulses. Nothing else moves on its own. All motion respects the "reduce motion" setting.

---

## 2. Visual identity and design system

### Colour tokens (light theme; dark theme mirrors them)

| Token | Value | Use | Accessibility rule |
|---|---|---|---|
| `navy-900` | #0E1430 (logo "SPORTS") | Scoreboards, headers of live areas, primary text | — |
| `navy-700` | #1E2A5A | Navy surfaces, second level | — |
| `white` / `paper` | #FFFFFF / #F7F8FB | Reading and form surfaces | — |
| `volt` (electric yellow) | #F6C642 (logo ring) | Live / next up / your action highlights, primary button **on navy** | **Never yellow text on white** (fails contrast). Yellow is a fill with navy text, or text on navy |
| `flame` | #E4572A → #EE7A2B (logo "SPHERE") | Brand accent, primary button on white | Large text or fills only |
| Ring accents | yellow / orange / red / green / blue from the logo | Sport colour coding, chart series | Only as small markers, never large areas |
| Neutrals | grey 50–900 | Borders, secondary text | Body text ≥ 4.5:1 |
| Status | Live = volt dot on navy · Upcoming = blue · Completed = grey · Postponed = amber · Cancelled = red outline · Final = green | One meaning per colour, everywhere | Status always has a text label, never colour alone |

### Typography
- **Display:** Lato 900 italic, uppercase for headings ("FIXTURES ARE READY").
- **Body and UI:** Lato 400/700.
- **Numbers:** tabular figures (Lato with `font-variant-numeric: tabular-nums`). JetBrains Mono only for IDs (Sports ID, registration reference).
- **Scale:** 12 / 14 / 16 / 20 / 24 / 32 / 48 / 72. Scores on the match centre at 72–120.

### Components
Existing ones in `src/components/ui/` get restyled. New ones get built once and reused.

| Component | Status | Notes |
|---|---|---|
| Button, Field, Select, Checkbox, Dialog, Toast, Badge | exist → restyle | Small corners; primary = flame on white, volt on navy |
| **Status pill** | new | Live (pulsing dot) / Upcoming / Completed / Postponed / Cancelled / Final / Registration open/closed |
| **Tournament card** | new | Name, sport, dates, venue, registration deadline, status, "View tournament" |
| **Match card / row** | new | Team A vs Team B, score, time/court, status, round. Compact and full sizes |
| **Scoreboard** | new | Navy band, big tabular scores, period/set/innings, clock |
| **Tabs** | new | Overview · Participants · Fixtures · Standings · Results · Rules |
| **Filter bar** | new | Search + sport + status + date. Filters live in the URL so they can be shared |
| **Standings table** | exists → restyle | Sticky header, your team highlighted, sport-specific columns |
| **Bracket** | new | Knockout tree, scrolls sideways on phones, winner path highlighted |
| **Stat tile** | exists → restyle | Number + label, used sparingly |
| **Empty state** | exists → rewrite copy | Says what will appear and when, never just "No data" |
| **Skeleton** | exists | Loading placeholders that match the final layout |

---

## 3. Page and navigation structure

**Public (anyone).** Top bar: Tournaments · Live · Results · Register · Sign in

```
/                      Home: discovery and entry point
/tournaments           Discovery: search and filters, Live / Upcoming / Completed
/tournaments/[slug]    Tournament page with tabs (Overview, Participants, Fixtures, Standings, Results, Rules)
/live                  All live matches now
/matches/[id]          Match centre (public scoreboard and events)
/results               Recent results and champions across tournaments
/tournaments/[slug]/champions   Championship page (only when results are final)
/verify/[code]         Certificate check (exists)
/register              Registration journey (exists, gains "choose tournament")
```

**Participant** (signed-in student): "My Sphere"
```
/me                    Dashboard: next match, registration status, messages (today's /status, expanded)
/me/registrations      Each tournament entry and its status
/me/matches            My fixtures and results
/me/certificates       Downloads
/me/profile            Contact details, data and privacy
```

**Organiser** (admins; Tournament Managers in Phase 3): the existing `/admin`, reorganised by tournament:
```
Overview · Tournaments · Registrations · Teams · Fixtures & schedule · Live matches · Results & rankings ·
Announcements · Reports · Staff & permissions · Settings · Audit log
```

**Desk and scorer** (officials): stays separate and phone-first:
```
/desk (verification) · /scan (QR check-in) · /score (my assigned matches → sport scoring screen)
```

Existing URLs keep working. `/status` and `/events` redirect to their new homes so old links and printed QR codes don't break.

---

## 4. One product, four experiences

| | Spectator | Participant | Organiser | Scorer / official |
|---|---|---|---|---|
| Goal | Follow scores, find results | Enter, get verified, know when and where to play | Run the tournament without touching code | Record the match correctly, fast |
| Entry point | Home → Live / Tournament | Register → My Sphere | Staff login → Overview | Staff login → My matches |
| Device | Phone first, TV screens | Phone first | Laptop first, works on tablet | Phone or tablet at the court |
| Density | Large type, few choices | Guided, one task per screen | Dense tables, filters, bulk actions | Huge buttons, one match at a time |
| Must never | See personal data | Lose a half-filled form | Publish unfinished results by accident | Lose a tap when the network drops |

---

## 5. Home page

**Hero (navy band).**
- Eyebrow: "MIT-WPU · Sports Sphere"
- Headline: **YOUR GAME. YOUR MOMENT. YOUR CHAMPIONSHIP.**
- Supporting line: "Find your competition, register in minutes and follow every match from the first whistle to the final."
- Buttons: **Explore tournaments** (primary) · **Register** · **Watch live** (only shown when something is live)
- Right side: the Sports Sphere logo, or, when matches are live, a compact live scoreboard instead.

**Sections, each shown only when it has real data:**
1. **Live now:** match cards with pulsing status. Hidden when nothing is live.
2. **Registration open:** tournament cards with closing dates ("Closes in 6 days").
3. **Upcoming tournaments:** next by start date.
4. **Recent results:** latest final scores.
5. **Sports:** the active sports, each linking to filtered tournaments.
6. **Announcements:** public notices only.

**No fake data.** With an empty database the home page shows one clear message instead of made-up tournaments: "Tournaments will appear here as soon as the sports office publishes them." Placeholders in text are labelled, e.g. *[Tournament name]*.

---

## 6. Tournament discovery and details

**Discovery (`/tournaments`)**
- Filter bar: search · sport · category · date range · registration (open/closed) · status (live/upcoming/completed).
- Three groups: **Live**, **Upcoming**, **Completed**.
- Each card: name, sport, category, dates, venue, registration deadline, registration status, tournament status.
- Empty filtered result: "No tournaments match these filters. Clear filters".

**Tournament page (`/tournaments/[slug]`)**
- Banner: name, season, dates, venue, status pill, registration call-to-action with deadline.
- Tabs appear as the tournament moves through its lifecycle:

| Tab | Shown when |
|---|---|
| Overview (description, eligibility, format, key dates, FAQ) | Always (once published) |
| Participants | Squads are locked |
| Fixtures | Schedule is published |
| Standings | First match is final |
| Results | First match is final |
| Rules | Rules are entered |

Draft tournaments are never public. Archived tournaments stay public as history.

---

## 7. Registration journey

The existing 7-step wizard stays: its autosave, validation and verification are already good. Changes:

1. **New step 0: choose tournament and events.** Only tournaments with registration open are offered, each with its closing date. Team registration (Phase 2): "Register myself" or "Register a team (team manager)".
2. Progress indicator shows the tournament name and steps: Identity → Selfie → Personal → Academic → Events → Medical & consent → Review.
3. **Submitted screen:** "Your registration is under review", the reference number, what happens next, and a link to My Sphere.
4. Copy pass on every message. For example, a closed event says "Registration for Hoop It Up closed on 15 Aug" instead of a generic error.

---

## 8. Match centre and scorer

**Public match centre (`/matches/[id]`)**
- Navy scoreboard: names (institution beneath), big score, status, period/set/innings, clock.
- A sport-specific panel underneath:
  - basketball: quarter scores, team fouls
  - volleyball: set-by-set
  - cricket: runs/wickets/overs and batting card
  - football: goal and card timeline
- Event timeline ("Q2 03:41 · +2 · #7 Rao").
- Updates pushed live (Phase 4). A score change flashes once.
- **TV mode** (`?display=tv`): full screen, no navigation, huge type, for courts and halls.

**Scorer screen (`/score`)**
- "My matches today": only assigned matches (Phase 4), with court and time.
- One match fills the screen; the controls depend on the sport:
  - basketball: +1/+2/+3 per team and player, foul, timeout
  - volleyball: point to A/B, set counter
- Always visible: undo last action, sync status ("3 actions waiting to send"), and "End period / End match" behind a press-and-hold.

---

## 9. Results and championship

- **Results page:** latest finals, filterable by tournament and sport.
- **Inside a tournament:** group tables, knockout bracket, individual statistics, medal table.
- **Championship page** (`/tournaments/[slug]/champions`), shown **only after the organiser confirms final results.** Never computed from unfinished or unconfirmed matches.
  - Navy and volt celebration layout: champion, runner-up, third place.
  - The final score, the path through the bracket, top performers.
  - Certificate links for the winners.
  - Restrained confetti once, on load, respecting reduced motion.
- **Tournament closure:** when an organiser closes a tournament, the page switches to "Final standings" and moves into the archive.

---

## 10. Page-by-page implementation plan

Each step ships working, uses real database data, and is tested on phone and desktop before the next one.

| Step | Pages / components | Depends on | Size |
|---|---|---|---|
| D1 | Design tokens (colours, type, radius, motion) + restyle existing UI components + status pill | — | 3–4 days |
| D2 | Public header/nav + **Home** (live, open registration, upcoming, results, sports, announcements, empty states) | Tournaments (done in Phase 1) | 3–4 days |
| D3 | **Tournament discovery** + **tournament page** (Overview, Participants, Standings, Results, Rules) | Tournaments | 4–5 days |
| D4 | Registration: step 0 "choose tournament", submitted screen, copy pass | Registration windows (done) | 2–3 days |
| D5 | **My Sphere** participant dashboard (from today's status page) | Notifications (done) | 3 days |
| D6 | Organiser area re-grouped by tournament, restyled tables and filters | — | 3–4 days |
| D7 | Fixtures tab, bracket, schedule views | **Phase 3** (stages, courts) | with Phase 3 |
| D8 | Match centre, TV mode, sport-specific scorer screens | **Phase 4** (scoring profiles, live updates) | with Phase 4 |
| D9 | Championship page, statistics and leaderboards | **Phase 5** | with Phase 5 |

D1–D6 can start now on the data that already exists. D7–D9 are designed now but built together with the back-end phase that provides their data, so nothing is a decorative screen without real data behind it.

**Questions before D1:**
1. Is the navy + electric-yellow emphasis right, with orange kept as the brand accent? (The official website leans on orange; the platform would lean on navy and yellow, using the same logo colours.)
2. Should the participant area be called **"My Sphere"** or simply **"My account"**?
3. Will there be TV screens at venues (this decides how much effort goes into TV mode)?
