# Sports Sphere — Tournament Management & Live Scoring: System Design

Status: **DRAFT, for approval.** Nothing in this document has been built yet. Date: 17 Nov 2026.

This design extends the existing registration portal (Next.js + Prisma). It doesn't replace it. Registration, identity checks, approval, teams, fixtures, live scoring, results, medals and certificates already work. This document fixes what is missing or weak.

Decisions still to be confirmed by the client are marked **[ASSUMPTION]**. Each one has a sensible default, so work can start on the parts that don't depend on it.

---

## 0. What exists today and what's wrong

| # | Problem (found in the code) | Effect at a real tournament | Fix (section) |
|---|---|---|---|
| 1 | All sports are scored the same way: each tap is "+1 home / +1 away" | Cricket, basketball, volleyball, badminton, table tennis, kabaddi, chess and combat sports can't be scored correctly | Scoring profiles per sport (§5) |
| 2 | Any Official can score any match | A volunteer could change a match they aren't at, by accident or on purpose | Match officials assignment (§3, §6) |
| 3 | Status is only Scheduled / Live / Completed / Walkover. No clash check | Rain or a court problem can't be recorded. Two matches can be booked on one court, or a team booked twice at once | New statuses + scheduling validator (§4) |
| 4 | Formats are League, Knockout or Race only | Hoop It Up style "groups, then knockout" isn't possible. No Swiss system for chess, no heats → final for athletics/swimming | Stages (§4) |
| 5 | A result is final as soon as it's entered. Corrections are "−1" taps | Wrong scores slip through. No referee sign-off. No record of why something changed | Two-step finalise + corrections with a reason (§5.4) |
| 6 | One meet at a time (meet name is a setting) | Hoop It Up and Sports Summit can't run side by side or be kept as seasons | Tournament level (§7) |
| 7 | Every admin can create other admins | One compromised or careless admin account controls everything | Super Admin role (§2) |
| 8 | Spectator pages re-download every 15 s | Scores lag; with hundreds of viewers the server does needless work | Server-Sent Events push (§6) |
| 9 | Live taps: duplicate check and insert are two separate steps | Two near-simultaneous retries of the same tap can return an error | Single atomic insert (§6) |
| 10 | Result entry has no version check | Two people entering a result at once silently overwrite each other | Version check, as approvals already use (§6) |

Also missing from the original brief, and covered here: protests and appeals (§5.5), referee conflict of interest (§3), venue big-screen mode (§6), and which rulebook applies (§5.3).

---

## 1. Tournament workflow (end to end)

```
SET-UP            REGISTRATION         PRE-EVENT              EVENT DAYS                 CLOSE
──────            ────────────         ─────────              ──────────                 ─────
Super Admin       Students register    Admin locks entries    Officials check in          Admin confirms
creates the       → identity checks    Teams + squads         athletes (QR scan)          podiums
Tournament        → desk measures      locked                 Scorers score assigned      Certificates
(e.g. Hoop It     → admin approves     Fixtures generated     matches live                issued
Up 2027)          → QR Sports ID       (groups / bracket)     Referee confirms each       Results
                                       Schedule built on      result                      published,
Admin adds        Withdrawals and      courts, clash-checked  Standings + brackets        season archived
events, rules,    change requests      Officials assigned     update automatically
venues, courts    handled              Schedule published     Protests resolved
```

Each stage has a gate that the system enforces:

| Gate | Rule |
|---|---|
| Entries close | After `entriesCloseAt`, no new registrations for that tournament; change requests need an admin |
| Squads lock | Fixtures can't be generated until squads are locked (`Team.lockedAt`, already exists) |
| Schedule publish | Refused while there are clashes (§4.3) or matches with no assigned scorer |
| Match start | Only an assigned scorer (or admin) can start it; both sides must be known |
| Result final | Needs scorer submit **and** referee/admin confirm (§5.4) |
| Podium | Only when every match in the stage is final (already enforced via `suggestPlacings`) |

---

## 2. Roles and permissions

Existing roles stay: ADMIN, OFFICIAL, MEDICAL, COACH, STUDENT. Changes are in **bold**.

| Role | Scope | Can | Can't |
|---|---|---|---|
| **SUPER_ADMIN** (new; 1–2 people, e.g. Director of Sports) | Whole platform | Create/disable admins, create tournaments, platform settings, everything an Admin can | — (every action audited) |
| ADMIN → **Tournament Admin** | **Tournaments they're assigned to** | Registrations, approvals, teams, fixtures, schedule, assign officials, resolve protests, confirm results, podiums | Create admins; see medical data; touch other tournaments |
| OFFICIAL → split into **SCOREKEEPER** and **REFEREE** duties per match (one role, the duty comes from the match assignment) | **Only matches assigned to them** | Scorekeeper: start match, score, record events, submit result. Referee: confirm/return result, rule on on-field protests | Score unassigned matches; change a confirmed result |
| Desk official | (unchanged) Verification desk, QR scan | Measure height/weight, scan IDs | Approve athletes |
| MEDICAL | (unchanged) | Medical conditions | — |
| COACH | (unchanged) own sport's approved players | View squad, raise age concern | Edit anything |
| **INSTITUTION COORDINATOR** (new) | Their own college | Confirm that a registrant studies there; see their college's entries and fixtures | See other colleges' data |
| Student / participant | Self | Status, ID, fixtures, opponents, results, certificates | — |
| Public | — | Live scores, fixtures, standings, brackets, results (names and institutions only) | Any personal data |

**How a person gets authorised to score.** A Tournament Admin assigns them to a match as SCOREKEEPER (or REFEREE). The scoring page and the scoring API check the assignment, not just the role. An admin can reassign a match at any moment, for example if a volunteer doesn't show up. Access ends when the match is final.

**Conflict of interest.** When assigning a referee or scorekeeper, the system warns if their home institution matches either side's institution. The admin can override, but must give a reason, which is audited.

**Account safety.**
- Staff are invited by email link. Nobody types passwords for them.
- Password change is forced on first login.
- Super Admin and Admin need a second factor (TOTP authenticator app).

---

## 3. Dashboards

**Super Admin**
- Tournaments (create, archive, assign admins)
- Admins and permissions
- Platform settings
- Audit log across all tournaments

**Tournament Admin** (existing admin dashboard, scoped to one tournament with a tournament switcher)
- *Today*: live matches, matches with no scorer, clashes, pending results to confirm, open protests
- *Registrations*: existing queue (Ready to approve, flagged, etc.)
- *Events & formats*: stages, groups, rules per event
- *Schedule*: a grid with courts as columns and time slots as rows. Drag a match to move it; clashes go red instantly.
- *Officials*: roster, availability, assignments per match, conflict-of-interest warnings
- *Results*: submitted → confirm / return with reason; corrections log
- *Protests*: open → under review → upheld / dismissed

**Scorekeeper / Referee (phone first)**
- *My matches today*: only assigned ones, with court and time
- *Scoring screen*: built from the sport's scoring profile (§5), big tap targets, works offline
- *Submit result*: summary for both sides, then submit
- *Referee*: Confirm, or Return to scorer with a reason

**Participant** (existing "My games" on `/status`)
- Next match: opponent, court, time
- Group table position, bracket path
- Results and certificates
- **New:** a notification when their match is moved

**Public spectator**
- *Live now*: every live match, scores pushed instantly
- *By event*: fixtures, group tables, bracket, results, top performers [ASSUMPTION: basketball points leaders only, in phase 1]
- *Venue display*: full-screen scoreboard for a court (`/display/court/<id>`) for a TV at the venue

---

## 4. Matches, stages and scheduling

### 4.1 Stages (fixes problem 4)

An event has one or more ordered **stages**, and each stage has a format:

| Format | Used for | How entrants come in |
|---|---|---|
| GROUPS | Group round robin (basketball, football, volleyball, kabaddi) | Seeded or snake-drawn into groups |
| KNOCKOUT | Brackets (all team sports, racket sports, combat per weight class) | Directly, or "top N from each group" |
| LEAGUE | Single table, everyone plays everyone | Directly |
| SWISS | Chess | Directly; pairing each round by score |
| HEATS_FINAL | Athletics track, swimming | Heats → fastest N by time to final |
| ATTEMPTS | Weightlifting, field events | Ranked by best mark (exists as RACE) |

Example for Hoop It Up Men: Stage 1 GROUPS (8 groups of 4) → Stage 2 KNOCKOUT (round of 16, from the top 2 per group).

Cross-group seeding uses the standard pattern: A1 v B2, B1 v A2, and so on, so group winners don't meet in the first knockout round.

### 4.2 Match statuses (fixes problem 3)

```
SCHEDULED ──► LIVE ──► SUBMITTED ──► FINAL
   │  ▲         │          │  ▲
   │  └─────────┤          └──┘ returned to scorer
   ▼            ▼
POSTPONED   SUSPENDED (stopped, e.g. rain or injury; can resume)
   │
   ▼
CANCELLED     WALKOVER / FORFEIT (with reason)     BYE
```

- Postponed matches keep their pairing and need a new slot.
- Cancelled matches need a reason and an admin.
- The "Upcoming" label in the brief is a display state (scheduled, starting within 2 hours), not a stored status.

### 4.3 Scheduling and clash prevention

Courts are real records (Venue → Court). Every match gets a court, start time and expected duration (from the format: periods × minutes + changeover buffer).

The validator runs on every move and before publishing:

1. **Court clash.** Two matches overlap on the same court.
2. **Entrant clash.** A team or athlete is in two overlapping matches, including across events (one athlete in singles and doubles).
3. **Rest gap.** A team plays again within less than the minimum rest [ASSUMPTION: 60 min, set per event].
4. **Official clash.** One official is assigned to overlapping matches.
5. **Dependency order.** A semi-final can't be scheduled before both quarter-finals that feed it.

Auto-scheduler: matches are placed greedily, in round order, into the earliest free slot that passes all five rules. Admins then adjust by hand.

---

## 5. Live scoring per sport

### 5.1 One event log, many rulebooks (fixes problem 1)

Every action at a match is stored as an append-only **MatchEvent**. Examples: "2 points, #7, home, Q2 03:41", "wicket, bowled", "set won". Nothing is overwritten.

Each sport has a **scoring profile** in code, with three parts:

1. **Event types** it accepts. These become the buttons on the scorer screen.
2. **A reducer** that replays the event log into the match state (score, sets, overs, fouls, period).
3. **A result rule** that decides when the match is over and who won.

The score shown everywhere is always computed from the log. That makes offline sync, undo and audit naturally correct.

### 5.2 Profiles

| Family | Sports | Scorer records | Result rule (defaults, editable per event) |
|---|---|---|---|
| Points in timed periods | Basketball | 1 / 2 / 3 points by player, personal and team fouls, timeouts, period end | Higher score after 4 periods; overtime periods until untied. Player fouled out at 5 fouls |
| Goals in timed periods | Football | Goal (player), own goal, yellow/red card, period end, shoot-out kicks | Higher score; draw allowed in groups; extra time + penalties in knockout |
| Raid points | Kabaddi | Raid points (touch / bonus), tackle point, super tackle, all-out, technical point | Higher score after 2 halves; tie-break per rules in knockout |
| Rally sets | Volleyball, Badminton, Table Tennis | Rally point to a side, timeout, set end | Volleyball: best of 5, sets to 25, 5th set to 15, win by 2. Badminton: best of 3, to 21, win by 2, cap 30. Table tennis: best of 5, to 11, win by 2 |
| Innings, ball by ball | Cricket | Each delivery: runs, extras (wide, no-ball, bye, leg-bye), wicket + type, batter/bowler | Most runs; won by runs or wickets; tie → super over. Overs per innings set per event. DLS is out of scope (admin enters a revised target by hand) |
| Chasing innings | Kho-Kho | Out recorded per chaser, innings end | Most points after innings |
| Bouts (referee decides) | Wrestling, Judo, Boxing | Wrestling: technical points, fall. Judo: waza-ari / ippon, shido. Boxing: judges' round scores | Referee enters the decision type and winner; points shown for the record. Combat sports are **not** scored by volunteers tapping live |
| Measured | Athletics, Swimming | Time or distance per athlete per heat | Rank by mark; heats → final (exists as RACE) |
| Attempts | Weightlifting | Snatch and clean & jerk attempts: good / no lift | Best snatch + best C&J = total; tie → lighter bodyweight |
| Games | Chess | 1-0, ½-½, 0-1 per board | Swiss: points, then Buchholz tiebreak |

### 5.3 Which rulebook

The defaults above follow the international federation rules (FIBA, FIFA, IVF/PKL, FIVB, BWF, ITTF, ICC, KKFI, UWW, IJF, World Boxing, World Athletics, World Aquatics, IWF, FIDE).

**[ASSUMPTION]** Inter-university events follow the Association of Indian Universities (AIU) rules, which mostly adopt the federation rules with local changes such as shorter periods. Every number that varies (period length, sets, points to win, overs, overtime, fouls limit) is a per-event setting, not hard-coded. The sports office signs off each event's settings before fixtures are generated.

### 5.4 Corrections and finalising (fixes problem 5)

- **Undo during play.** The scorer taps "undo last". This adds a `VOID` event pointing at the original. Nothing is deleted, and the log shows both.
- **Submit.** At the end, the scorer submits. The status becomes SUBMITTED and the match is locked for scoring.
- **Confirm.** The referee or a Tournament Admin confirms, and the status becomes FINAL. Only then do standings, bracket advancement and medals update.
- **Return.** If the referee returns the result, it goes back to the scorer with a reason.
- **Correcting a FINAL result.** Only a Tournament Admin can do this, and only with a written reason. It's refused if the next knockout round has started (existing rule). It creates a correction record (old value, new value, who, why), recalculates standings, and notifies both sides.
- **Accidental-tap protection.**
  - Score buttons debounce taps within 300 ms.
  - Large swings (e.g. a basketball score changing by more than 10 in one action) ask for confirmation.
  - "End period" and "End match" need a press-and-hold.

### 5.5 Protests and appeals

- A team manager or captain lodges a protest against a match within a time limit [ASSUMPTION: 30 min after the match].
- The match result shows "Under protest". It counts provisionally, but **knockout advancement waits**.
- The Tournament Admin, as jury, records a decision (upheld / dismissed) and the reason.
- If upheld, the admin applies a correction (§5.4) or orders a replay.

### 5.6 Withdrawals, disqualifications, replacements

| Case | Rule |
|---|---|
| Withdrawal before fixtures | The entry is removed; no effect on fixtures |
| Withdrawal mid-group | **[ASSUMPTION]** Results stand if the team has played at least 50% of its group matches; otherwise its results are annulled. Remaining matches are walkovers |
| Withdrawal mid-knockout | The opponent gets a walkover |
| Disqualification | Same as withdrawal, plus a reason and an audit entry. An athlete's QR stops working (existing FLAGGED status) |
| Player replacement | Only from approved athletes registered for the event. Allowed until the squad lock, after that only with admin approval and a reason (e.g. injury, with a medical note) |

---

## 6. Real-time architecture (fixes problems 8, 9 and 10)

```
 Scorer phone                     Server                                   Spectators
 ────────────                     ──────                                   ──────────
 tap ─► local queue ─► POST /api/score/<match>/events (batch)
        (IndexedDB)     │ 1. session + match assignment check
        retries with    │ 2. validate each event against the sport profile + match state
        backoff         │ 3. INSERT … ON CONFLICT(clientId) DO NOTHING   (atomic dedupe)
                        │ 4. replay log → new state; save state + version  (one transaction)
                        │ 5. publish "match:<id> v<version>"
                        ▼
                   event bus ───────────────► GET /api/live (Server-Sent Events) ─► live pages
                   (in-process now;                                                 big screens
                    Redis pub/sub when
                    more than one server)
```

- **Offline.**
  - Each tap gets a unique ID on the phone and is saved locally before sending (already true today).
  - On reconnect the queue replays in order, and the server ignores IDs it has already stored, so nothing is double-counted.
  - The scorer screen shows "3 actions waiting to send".
- **Ordering.** Each event carries a per-device sequence number as well as the device time. The server orders by device time, then sequence, so a phone with a wrong clock can't scramble the order within its own events.
- **Two phones on one match.** Only one scorer is assigned to a match at a time. A second assigned phone gets read-only mode unless the admin hands over scoring.
- **Concurrent edits.** Result submission, confirmation and corrections carry the match `version`. If someone else acted first, the action is refused with "Match changed — refresh". Approvals already use this pattern.
- **Spectators.**
  - Server-Sent Events push updates within about a second.
  - If the connection fails, the page falls back to checking every 15 s (today's behaviour).
  - Many matches can be live at once; each page subscribes only to the matches it shows.
- **Scale.** SQLite is fine on one server for development. For the live tournament: PostgreSQL + Redis, so more than one server instance can run. The code already supports switching to PostgreSQL through `DATABASE_URL`.

---

## 7. Data model

New tables and changes, Prisma-style. Existing tables are unchanged unless listed.

```
Tournament      id, name ("Hoop It Up 2027"), slug, season ("2027-28"), startDate, endDate,
                entriesCloseAt, status (DRAFT|OPEN|LIVE|CLOSED|ARCHIVED), ageCutoffDate
TournamentAdmin tournamentId, staffId                       (which admins run which tournament)
Venue           id, name ("Dronacharya Sports Complex")
Court           id, venueId, name ("Court 2"), sports[]

Event           + tournamentId, + rulesJson (per-event scoring settings), + minRestMinutes
Stage           id, eventId, order, format (GROUPS|KNOCKOUT|LEAGUE|SWISS|HEATS_FINAL|ATTEMPTS),
                configJson (group size, advancing N, rounds…), status
Group           id, stageId, name ("Group A")
GroupEntry      groupId, teamId | studentId, seed

Match           + stageId, + groupId?, + matchNo ("M-37"), + courtId, + durationMin,
                status: SCHEDULED|LIVE|SUSPENDED|SUBMITTED|FINAL|POSTPONED|CANCELLED|WALKOVER|BYE,
                + stateJson (computed live state: sets, overs, fouls, period),
                + version, + submittedAt/ById, + confirmedAt/ById, + statusReason
                (keeps: home/away team|student, scores, winner, nextMatchId/nextSide)
MatchOfficial   matchId, staffId, duty (SCOREKEEPER|REFEREE|UMPIRE|JUDGE), assignedById, coiOverrideReason?
MatchEvent      id, matchId, clientId UNIQUE, deviceSeq, type, side, studentId?, value, period,
                clock?, payloadJson, voidsEventId?, byId, at, createdAt
                (replaces ScoreEvent; existing rows migrate as type=POINT)
MatchCorrection matchId, before (json), after (json), reason, byId, at
Protest         matchId, lodgedBy (team/student), reason, status (OPEN|UPHELD|DISMISSED), decision, decidedById
Sanction        eventId, teamId|studentId, type (WITHDRAWN|DISQUALIFIED), reason, byId, at
Standing        (computed, cached) stageId, groupId?, entrant, p, w, d, l, for, against, pts, tiebreakJson

StaffUser       role: + SUPER_ADMIN, + COORDINATOR; + collegeId (coordinators), + totpSecret, + mustChangePassword
```

**How the data flows.**
- Registration (approved) → Team / GroupEntry → Match (via Stage) → MatchEvent log → computed Match state → on FINAL: Standing recalculated → next-stage entries filled (group → knockout) → Placing (podium) → Certificate.
- Every write is also recorded in the existing AuditLog.

---

## 8. Worked example — Hoop It Up 2027

**Set-up (June)**
- The Super Admin creates "Hoop It Up 2027" for 27–30 Aug, with entries closing 15 Aug, and assigns two Tournament Admins.
- Events: Men's and Women's basketball (5×5), FIBA defaults, **[ASSUMPTION]** 4 × 10-minute quarters.
- Venue: Dronacharya Complex, 4 courts.

**Registration (July – 15 Aug)**
- 32 men's teams and 16 women's teams enter.
- Coordinators at visiting colleges confirm their students.
- The desk measures athletes on arrival, and admins approve them.

**Draw (16 Aug)**
- Squads lock.
- Men: 8 groups of 4, then a round of 16. Women: 4 groups of 4, then quarter-finals.
- The system snake-seeds by last year's finish.
- Match count: men 48 group + 15 knockout = 63; women 24 + 7 = 31; **94 matches** in total.

**Schedule**
- 1-hour slots (40 min of play + stoppages + changeover), 10 slots per day, 4 courts = 40 matches per day.
- Days 1–2: all 72 group matches. Day 3: men's R16 + women's QF (12). Day 4: men's QF, all semis, both finals (10). Total 94.
- The validator flags one team scheduled at 10:00 and 10:30. The admin drags the 10:30 game to 11:00, and it turns green.
- About 30 scorekeepers and referees are assigned. The system warns that a COEP referee is on a COEP match; the admin swaps them.

**Match day**
- Scorer Riya opens "My matches" and starts M-14, Court 2.
- She taps "+2 #7 Home", "Foul #11 Away" and so on. Wi-Fi drops for 4 minutes; the screen shows "12 actions waiting". On reconnect they sync, with no duplicates.
- Spectators on the Live page and the court TV see the scores within about a second.
- At full time Riya submits. The referee checks the summary and confirms. Group A's table updates.
- At the end of day 2, the top 2 per group fill the R16 bracket automatically.

**Protest**
- A team protests an ineligible player in M-41. The result shows "Under protest", and the R16 slot waits.
- The admin finds the player approved and eligible, and dismisses the protest with a reason. The bracket advances.

**Close**
- After the finals, the admin confirms the podiums.
- Participation and medal certificates are issued, with QR verification.
- Results are pushed to the Winners board on the official website (content/results), and the tournament is archived.

---

## 9. Problems we expect, and their solutions

| Risk | Solution |
|---|---|
| Patchy internet on courts | Offline-first scoring queue (exists), synced on reconnect; a portable 4G hotspot per venue as a backup |
| Scorer phone dies mid-match | The admin reassigns the match to another phone; the full log is already on the server, so the new phone continues from the current state. Paper score sheet as last resort, with the admin entering the final score and a reason |
| Wrong score entered | Undo (VOID event); referee confirmation before FINAL; corrections need an admin and a reason |
| Unauthorised score changes | Match-level assignment check on every request; scoring locks after submit; audit log |
| Scheduling clashes | Validator blocks publishing; rest-gap rule |
| Ties in group tables | Per-sport tie-break order: FIBA uses head-to-head first, then point difference; football uses goal difference, goals scored, head-to-head. Configurable per event |
| A team withdraws mid-tournament | Withdrawal rules (§5.6) applied automatically, with walkovers created |
| Disputes | Protest workflow holds advancement until decided |
| Many viewers at a final | Server-Sent Events + caching; PostgreSQL + Redis in production |
| Wrong rules for a sport | Rules are per-event settings, signed off by the sports office before fixtures |
| Personal data on public pages | Public pages show names and institutions only (existing rule) |

---

## 10. Build plan

| Phase | Scope | Ready for |
|---|---|---|
| **1 — Foundations** (~2–3 weeks) | Fixes 6–10: Tournament level, Super Admin, match officials + assignment check, new statuses, venues/courts + clash validator, atomic taps, version checks, two-step finalise + corrections, SSE live updates | Any event |
| **2 — Basketball** (~2 weeks) | Stages (groups → knockout, cross-seeding), basketball scoring profile (points by player, fouls, timeouts, overtime), FIBA tie-breaks, court display screen, points leaders | **Hoop It Up, Aug 2027** |
| **3 — Summit sports** (~3–4 weeks) | Profiles for the Sports Summit's sports (likely football, volleyball, badminton, table tennis, kabaddi, cricket, chess Swiss, athletics heats) | **Sports Summit, Oct 2027** |
| **4 — Rest + polish** | Combat sports, weightlifting, kho-kho, swimming; protests UI polish; coordinator role; TOTP | Full season |

Each phase is tested before the next starts: automated tests for every reducer and tie-break, plus a full mock tournament run with simulated phones going offline.

---

## 11. Questions for the client

1. Which sports and formats are at Hoop It Up and Sports Summit, and how many teams are expected per event?
2. Which rulebook applies per sport (AIU, federation, or local)? Who signs off the settings?
3. Who scores and referees: staff, student volunteers, or federation officials? Do they have smartphones?
4. How reliable is internet at the Dronacharya Complex courts? Is a venue Wi-Fi network available?
5. Spectators: scores and tables only, or player stats (top scorers)?
6. Should visiting colleges have their own coordinator login?
7. Protest fee and time limit, withdrawal rules: are there existing Sports Sphere rules?
8. Is there a server for production (university IT), or should we plan cloud hosting?
