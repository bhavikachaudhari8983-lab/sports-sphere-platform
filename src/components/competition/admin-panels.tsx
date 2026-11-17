"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Award, Crown, Lock, Plus, Radio, Shuffle, Trash2, Unlock, UserMinus } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/ui/status-pill";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client-api";
import { FORMATS, FORMAT_LABEL, type Format } from "@/lib/constants";
import { cn, formatDateTime } from "@/lib/utils";

type Body = Record<string, unknown> & { op: string };

function useCompOp(eventId: string) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function run<T = unknown>(body: Body, success: string | ((d: T) => string), key = body.op): Promise<T | null> {
    setBusy(key);
    setErrors({});
    const r = await api<T>(`/api/admin/competition/${eventId}`, { body });
    setBusy(null);
    if (!r.ok) {
      setErrors(r.fieldErrors);
      toast.error("Not saved", r.error);
      return null;
    }
    toast.success(typeof success === "string" ? success : success(r.data));
    router.refresh();
    return r.data;
  }
  return { run, busy, errors };
}

// ---------- Format ----------
export type FormatValues = { format: Format | null; periods: number | null; periodMinutes: number | null; shootout: boolean; pointsWin: number; pointsDraw: number; rosterMin: number | null; rosterMax: number | null };

export function FormatForm({ eventId, initial, isTeam }: { eventId: string; initial: FormatValues; isTeam: boolean }) {
  const { run, busy, errors } = useCompOp(eventId);
  const [v, setV] = useState({
    format: initial.format ?? (isTeam ? "LEAGUE" : "KNOCKOUT"),
    periods: initial.periods?.toString() ?? "",
    periodMinutes: initial.periodMinutes?.toString() ?? "",
    shootout: initial.shootout,
    pointsWin: String(initial.pointsWin),
    pointsDraw: String(initial.pointsDraw),
    rosterMin: initial.rosterMin?.toString() ?? "",
    rosterMax: initial.rosterMax?.toString() ?? "",
  });
  const num = (s: string) => (s.trim() ? s : null);
  return (
    <form
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run({ op: "format", format: v.format, periods: num(v.periods), periodMinutes: num(v.periodMinutes), shootout: v.shootout, pointsWin: v.pointsWin, pointsDraw: v.pointsDraw, rosterMin: num(v.rosterMin), rosterMax: num(v.rosterMax) }, "Format saved");
      }}
    >
      <Field id="fmt" label="Format" className="sm:col-span-2" required>
        <Select {...fieldA11y("fmt")} value={v.format} onChange={(e) => setV({ ...v, format: e.target.value as Format })}>
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABEL[f]}
            </option>
          ))}
        </Select>
      </Field>
      {v.format !== "RACE" && (
        <>
          <Field id="periods" label="Periods" hint="e.g. 2 halves" error={errors.periods}>
            <Input {...fieldA11y("periods", errors.periods, true)} type="number" min={1} inputMode="numeric" value={v.periods} onChange={(e) => setV({ ...v, periods: e.target.value })} />
          </Field>
          <Field id="pmin" label="Minutes per period" error={errors.periodMinutes}>
            <Input {...fieldA11y("pmin", errors.periodMinutes)} type="number" min={1} inputMode="numeric" value={v.periodMinutes} onChange={(e) => setV({ ...v, periodMinutes: e.target.value })} />
          </Field>
        </>
      )}
      {v.format === "LEAGUE" && (
        <>
          <Field id="pw" label="Points for a win" error={errors.pointsWin}>
            <Input {...fieldA11y("pw", errors.pointsWin)} type="number" min={0} inputMode="numeric" value={v.pointsWin} onChange={(e) => setV({ ...v, pointsWin: e.target.value })} />
          </Field>
          <Field id="pd" label="Points for a draw" error={errors.pointsDraw}>
            <Input {...fieldA11y("pd", errors.pointsDraw)} type="number" min={0} inputMode="numeric" value={v.pointsDraw} onChange={(e) => setV({ ...v, pointsDraw: e.target.value })} />
          </Field>
        </>
      )}
      {isTeam && (
        <>
          <Field id="rmin" label="Min. players per team" error={errors.rosterMin}>
            <Input {...fieldA11y("rmin", errors.rosterMin)} type="number" min={1} inputMode="numeric" value={v.rosterMin} onChange={(e) => setV({ ...v, rosterMin: e.target.value })} />
          </Field>
          <Field id="rmax" label="Max. players per team" error={errors.rosterMax}>
            <Input {...fieldA11y("rmax", errors.rosterMax)} type="number" min={1} inputMode="numeric" value={v.rosterMax} onChange={(e) => setV({ ...v, rosterMax: e.target.value })} />
          </Field>
        </>
      )}
      {v.format === "KNOCKOUT" && <Checkbox id="shoot" label="Shoot-out / super over breaks a draw" checked={v.shootout} onChange={(e) => setV({ ...v, shootout: e.target.checked })} className="sm:col-span-2" />}
      <div className="sm:col-span-2 lg:col-span-4">
        <Button type="submit" loading={busy === "format"}>
          Save format
        </Button>
      </div>
    </form>
  );
}

// ---------- Teams ----------
export type TeamView = {
  id: string;
  name: string;
  shortName: string;
  represents: string;
  locked: boolean;
  captainId: string | null;
  members: Array<{ id: string; name: string; sportsId: string | null; position: string | null }>;
  eligible: Array<{ id: string; label: string }>;
};

export function TeamsManager({ eventId, teams, schools, colleges, rosterMin, rosterMax }: { eventId: string; teams: TeamView[]; schools: Array<{ id: string; name: string }>; colleges: string[]; rosterMin: number | null; rosterMax: number | null }) {
  const { run, busy, errors } = useCompOp(eventId);
  const [form, setForm] = useState({ name: "", shortName: "", represents: schools[0] ? `school:${schools[0].id}` : "university" });
  const [pick, setPick] = useState<Record<string, string>>({});
  const [remove, setRemove] = useState<TeamView | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const [kind, value] = form.represents.split(/:(.*)/s);
    const ok = await run({ op: "team-create", name: form.name, shortName: form.shortName, schoolId: kind === "school" ? value : null, collegeName: kind === "college" ? value : null }, `${form.name} created`);
    if (ok) setForm({ ...form, name: "", shortName: "" });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="grid gap-3 rounded-xl border border-dashed border-border-strong p-4 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end">
        <Field id="tname" label="Team name" error={errors.name} required>
          <Input {...fieldA11y("tname", errors.name)} placeholder="e.g. Computer Science FC" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field id="tshort" label="Short name" error={errors.shortName} required>
          <Input {...fieldA11y("tshort", errors.shortName)} placeholder="CSE" maxLength={5} value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value.toUpperCase() })} className="font-mono uppercase" />
        </Field>
        <Field id="trep" label="Represents">
          <Select {...fieldA11y("trep")} value={form.represents} onChange={(e) => setForm({ ...form, represents: e.target.value })}>
            <optgroup label="Our schools (players must belong to the school)">
              {schools.map((s) => (
                <option key={s.id} value={`school:${s.id}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
            {colleges.length > 0 && (
              <optgroup label="Visiting colleges">
                {colleges.map((c) => (
                  <option key={c} value={`college:${c}`}>
                    {c}
                  </option>
                ))}
              </optgroup>
            )}
            <option value="university">Whole university (any approved player)</option>
          </Select>
        </Field>
        <Button type="submit" loading={busy === "team-create"} icon={<Plus className="size-4" aria-hidden />}>
          Create team
        </Button>
      </form>

      {teams.length === 0 && <p className="text-muted">No teams yet.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {teams.map((t) => {
          const short = rosterMin != null && t.members.length < rosterMin;
          return (
            <div key={t.id} className="space-y-3 rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-heading text-lg font-semibold">
                    {t.name} <span className="font-mono text-small text-muted">{t.shortName}</span>
                  </p>
                  <p className="text-small text-muted">{t.represents}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={short ? "warning" : "neutral"}>
                    {t.members.length}
                    {rosterMax ? `/${rosterMax}` : ""} players
                  </Badge>
                  {t.locked && <Badge tone="success" icon={<Lock className="size-3.5" aria-hidden />}>Locked</Badge>}
                </div>
              </div>
              {short && <p className="text-small text-warning-fg">Needs at least {rosterMin} players before the roster can be locked.</p>}
              <ul className="space-y-1">
                {t.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{m.name}</span>
                      {t.captainId === m.id && <Badge tone="info" className="ml-2" icon={<Crown className="size-3.5" aria-hidden />}>Captain</Badge>}
                      <span className="block font-mono text-small text-muted">
                        {m.sportsId}
                        {m.position ? ` · ${m.position}` : ""}
                      </span>
                    </span>
                    {t.captainId !== m.id && (
                      <button type="button" className="grid size-11 place-items-center rounded-lg text-muted hover:bg-surface hover:text-fg" aria-label={`Make ${m.name} captain`} onClick={() => run({ op: "captain", teamId: t.id, studentId: m.id }, "Captain set", `cap-${m.id}`)}>
                        <Crown className="size-4" aria-hidden />
                      </button>
                    )}
                    {!t.locked && (
                      <button type="button" className="grid size-11 place-items-center rounded-lg text-muted hover:bg-surface hover:text-danger-fg" aria-label={`Remove ${m.name}`} onClick={() => run({ op: "member-remove", teamId: t.id, studentId: m.id }, `${m.name} removed`, `rm-${m.id}`)}>
                        <UserMinus className="size-4" aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {!t.locked && (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run({ op: "member-add", teamId: t.id, studentId: pick[t.id] ?? "" }, "Player added", `add-${t.id}`).then((d) => d && setPick({ ...pick, [t.id]: "" }));
                  }}
                >
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Add a player to {t.name}</span>
                    <Select value={pick[t.id] ?? ""} onChange={(e) => setPick({ ...pick, [t.id]: e.target.value })}>
                      <option value="">{t.eligible.length ? `Add player (${t.eligible.length} eligible)…` : "No eligible approved players left"}</option>
                      {t.eligible.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button type="submit" variant="outline" loading={busy === `add-${t.id}`} disabled={!pick[t.id]} icon={<Plus className="size-4" aria-hidden />}>
                    Add
                  </Button>
                </form>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={t.locked ? "outline" : "secondary"} loading={busy === `lock-${t.id}`} onClick={() => run({ op: "lock", teamId: t.id, locked: !t.locked }, t.locked ? "Roster unlocked" : "Roster locked", `lock-${t.id}`)} icon={t.locked ? <Unlock className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}>
                  {t.locked ? "Unlock roster" : "Lock roster"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRemove(t)} icon={<Trash2 className="size-4" aria-hidden />}>
                  Delete team
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        tone="danger"
        confirmLabel="Delete team"
        loading={busy === "team-delete"}
        title={`Delete ${remove?.name ?? "team"}?`}
        description="The roster is removed. Teams that have already played can't be deleted."
        onConfirm={async () => {
          if (remove && (await run({ op: "team-delete", teamId: remove.id }, "Team deleted"))) setRemove(null);
        }}
      />
    </div>
  );
}

// ---------- Fixtures & results ----------
export type MatchView = {
  id: string;
  label: string;
  division: string | null;
  home: string | null;
  away: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeTiebreak: number | null;
  awayTiebreak: number | null;
  status: string;
  winner: string | null;
  scheduledAt: string | null;
  bye: boolean;
  /** updatedAt when the page was loaded; a save is refused if the match changed since. */
  version: string;
  courtId: string | null;
  durationMin: number | null;
  statusReason: string | null;
  scorer: { id: string; name: string } | null;
  referee: { id: string; name: string } | null;
};

/** Options for scheduling a match: open courts, officials who can be assigned, the event's default match length. */
export type ManageOptions = { courts: Array<{ id: string; label: string }>; officials: Array<{ id: string; label: string }>; defaultMinutes: number; knockout: boolean };

/** ISO time → "YYYY-MM-DDTHH:mm" in Indian time, for <input type="datetime-local">. */
const toIstInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 16) : "");

function MatchManage({ eventId, m, manage, onDone }: { eventId: string; m: MatchView; manage: ManageOptions; onDone: () => void }) {
  const { run, busy, errors } = useCompOp(eventId);
  const [sched, setSched] = useState({ at: toIstInput(m.scheduledAt), court: m.courtId ?? "", len: m.durationMin?.toString() ?? "" });
  const [reason, setReason] = useState("");
  const canPostpone = m.status === "SCHEDULED" || m.status === "LIVE";
  const canCancel = (m.status === "SCHEDULED" || m.status === "POSTPONED") && !manage.knockout;
  const canReinstate = m.status === "POSTPONED" || m.status === "CANCELLED";
  const official = (duty: "SCOREKEEPER" | "REFEREE", current: { id: string } | null) => (
    <Field id={`${duty}-${m.id}`} label={duty === "SCOREKEEPER" ? "Scorer" : "Referee"} hint={duty === "SCOREKEEPER" ? "Only this official can score the match (admins can too)." : undefined}>
      <Select
        {...fieldA11y(`${duty}-${m.id}`)}
        value={current?.id ?? ""}
        disabled={busy === `${duty}-${m.id}`}
        onChange={(e) => void run({ op: "official", matchId: m.id, duty, staffId: e.target.value || null }, e.target.value ? "Official assigned" : "Official removed", `${duty}-${m.id}`)}
      >
        <option value="">Not assigned</option>
        {manage.officials.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface-2 p-3">
      {m.status !== "CANCELLED" && (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run({ op: "schedule", matchId: m.id, version: m.version, scheduledAt: sched.at, courtId: sched.court, durationMin: sched.len }, m.status === "POSTPONED" && sched.at ? "Match rescheduled" : "Schedule saved", `sch-${m.id}`)) onDone();
          }}
        >
          <Field id={`at-${m.id}`} label="Date and time (Indian time)" error={errors.scheduledAt}>
            <Input {...fieldA11y(`at-${m.id}`, errors.scheduledAt)} type="datetime-local" value={sched.at} onChange={(e) => setSched({ ...sched, at: e.target.value })} />
          </Field>
          <Field id={`court-${m.id}`} label="Court" error={errors.courtId}>
            <Select {...fieldA11y(`court-${m.id}`, errors.courtId)} value={sched.court} onChange={(e) => setSched({ ...sched, court: e.target.value })}>
              <option value="">No court</option>
              {manage.courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={`len-${m.id}`} label="Length (min)" error={errors.durationMin}>
            <Input {...fieldA11y(`len-${m.id}`, errors.durationMin)} type="number" min={5} max={600} inputMode="numeric" placeholder={String(manage.defaultMinutes)} value={sched.len} onChange={(e) => setSched({ ...sched, len: e.target.value })} />
          </Field>
          <Button type="submit" size="sm" loading={busy === `sch-${m.id}`}>
            {m.status === "POSTPONED" ? "Reschedule" : "Save schedule"}
          </Button>
        </form>
      )}
      {manage.courts.length === 0 && m.status !== "CANCELLED" && (
        <p className="text-small text-muted">
          No courts yet. <Link href="/admin/venues" className="font-semibold underline underline-offset-4">Add venues and courts</Link> to schedule matches onto them.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {official("SCOREKEEPER", m.scorer)}
        {official("REFEREE", m.referee)}
      </div>
      {(canPostpone || canCancel || canReinstate) && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          {(canPostpone || canCancel) && (
            <Field id={`reason-${m.id}`} label="Reason (shown to teams and spectators)" error={errors.reason} className="min-w-56 flex-1">
              <Input {...fieldA11y(`reason-${m.id}`, errors.reason)} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Rain, court unavailable" />
            </Field>
          )}
          {canPostpone && (
            <Button size="sm" variant="outline" loading={busy === `pp-${m.id}`} onClick={async () => { if (await run({ op: "match-status", matchId: m.id, to: "POSTPONED", reason }, "Match postponed", `pp-${m.id}`)) onDone(); }}>
              Postpone
            </Button>
          )}
          {canCancel && (
            <Button size="sm" variant="danger" loading={busy === `cx-${m.id}`} onClick={async () => { if (await run({ op: "match-status", matchId: m.id, to: "CANCELLED", reason }, "Match cancelled", `cx-${m.id}`)) onDone(); }}>
              Cancel match
            </Button>
          )}
          {canReinstate && (
            <Button size="sm" variant="secondary" loading={busy === `re-${m.id}`} onClick={async () => { if (await run({ op: "match-status", matchId: m.id, to: "SCHEDULED", reason: "" }, "Match reinstated", `re-${m.id}`)) onDone(); }}>
              Reinstate
            </Button>
          )}
          {manage.knockout && (m.status === "SCHEDULED" || m.status === "POSTPONED") && <p className="w-full text-small text-muted">Knockout matches can&apos;t be cancelled, because someone must go through. Record a walkover with the final score instead.</p>}
        </div>
      )}
    </div>
  );
}

export function GenerateFixtures({ eventId, hasMatches, disabledReason }: { eventId: string; hasMatches: boolean; disabledReason?: string }) {
  const { run, busy } = useCompOp(eventId);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Button onClick={() => (hasMatches ? setConfirm(true) : void run<{ matches: number }>({ op: "generate" }, (d) => `${d.matches} matches created`))} loading={busy === "generate"} disabled={!!disabledReason} variant={hasMatches ? "outline" : "primary"} icon={<Shuffle className="size-4" aria-hidden />}>
        {hasMatches ? "Regenerate fixtures" : "Generate fixtures"}
      </Button>
      {disabledReason && <p className="text-small text-muted">{disabledReason}</p>}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        loading={busy === "generate"}
        confirmLabel="Regenerate"
        title="Regenerate all fixtures?"
        description="The current fixture list is replaced. This is only allowed before any match has been played."
        onConfirm={async () => {
          if (await run<{ matches: number }>({ op: "generate" }, (d) => `${d.matches} matches created`)) setConfirm(false);
        }}
      />
    </>
  );
}

export function MatchRow({ eventId, m, knockout, shootout, manage }: { eventId: string; m: MatchView; knockout: boolean; shootout: boolean; manage?: ManageOptions }) {
  const { run, busy, errors } = useCompOp(eventId);
  const done = m.status === "COMPLETED" || m.status === "WALKOVER";
  const [edit, setEdit] = useState(false);
  const [managing, setManaging] = useState(false);
  const courtLabel = m.courtId ? manage?.courts.find((c) => c.id === m.courtId)?.label ?? "Court (closed)" : null;
  const [v, setV] = useState({ h: m.homeScore?.toString() ?? "", a: m.awayScore?.toString() ?? "", ht: m.homeTiebreak?.toString() ?? "", at: m.awayTiebreak?.toString() ?? "" });
  const ready = !!m.home && !!m.away && !m.bye;
  const tie = v.h !== "" && v.h === v.a;
  const side = (name: string | null, won: boolean) => <span className={cn("min-w-0 flex-1 break-words", won ? "font-semibold text-fg" : "text-fg", !name && "text-muted italic")}>{name ?? "To be decided"}</span>;

  return (
    <li className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted">
        <span>{m.label}</span>
        {m.scheduledAt && <span>{formatDateTime(m.scheduledAt)}</span>}
        {courtLabel && <span>{courtLabel}</span>}
        {m.status === "LIVE" && <Badge tone="danger" icon={<Radio className="size-3.5" aria-hidden />}>Live</Badge>}
        {m.status === "POSTPONED" && <StatusPill status="POSTPONED" />}
        {m.status === "CANCELLED" && <StatusPill status="CANCELLED" />}
        {m.bye && <Badge>Bye</Badge>}
        {m.scorer && <span>Scorer: {m.scorer.name}</span>}
      </div>
      {m.statusReason && <p className="text-small text-warning-fg">Reason: {m.statusReason}</p>}
      <div className="flex items-center gap-3">
        {side(m.home, m.winner === "HOME")}
        <span className="shrink-0 rounded-lg bg-surface-2 px-3 py-1 font-mono text-lg font-semibold tabular">
          {m.homeScore ?? "–"} : {m.awayScore ?? "–"}
          {m.homeTiebreak != null && <span className="ml-1 text-small text-muted">({m.homeTiebreak}–{m.awayTiebreak})</span>}
        </span>
        <span className="min-w-0 flex-1 text-right">{side(m.away, m.winner === "AWAY")}</span>
      </div>
      {ready && !edit && (
        <div className="flex flex-wrap gap-2">
          {m.status !== "CANCELLED" && m.status !== "POSTPONED" && (
            <Button size="sm" variant={done ? "ghost" : "outline"} onClick={() => setEdit(true)}>
              {done ? "Correct score" : "Enter final score"}
            </Button>
          )}
          {manage && !done && (
            <Button size="sm" variant="ghost" aria-expanded={managing} onClick={() => setManaging(!managing)}>
              {managing ? "Close" : "Manage"}
            </Button>
          )}
          {!done && m.status !== "CANCELLED" && m.status !== "POSTPONED" && (
            <Link href={`/score/${m.id}`} className={buttonClass("ghost", "sm")}>
              <Radio className="size-4" aria-hidden /> Live scoring
            </Link>
          )}
        </div>
      )}
      {managing && manage && <MatchManage eventId={eventId} m={m} manage={manage} onDone={() => undefined} />}
      {edit && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const body = { op: "result", matchId: m.id, version: m.version, homeScore: v.h, awayScore: v.a, homeTiebreak: tie && knockout ? v.ht || null : null, awayTiebreak: tie && knockout ? v.at || null : null };
            if (await run(body, "Result saved", `res-${m.id}`)) setEdit(false);
          }}
        >
          <Field id={`h-${m.id}`} label={m.home ?? "Home"} className="w-28">
            <Input {...fieldA11y(`h-${m.id}`)} type="number" min={0} inputMode="numeric" value={v.h} onChange={(e) => setV({ ...v, h: e.target.value })} required />
          </Field>
          <Field id={`a-${m.id}`} label={m.away ?? "Away"} className="w-28">
            <Input {...fieldA11y(`a-${m.id}`)} type="number" min={0} inputMode="numeric" value={v.a} onChange={(e) => setV({ ...v, a: e.target.value })} required />
          </Field>
          {tie && knockout && shootout && (
            <>
              <Field id={`ht-${m.id}`} label="Shoot-out (home)" error={errors.homeTiebreak} className="w-32">
                <Input {...fieldA11y(`ht-${m.id}`, errors.homeTiebreak)} type="number" min={0} inputMode="numeric" value={v.ht} onChange={(e) => setV({ ...v, ht: e.target.value })} />
              </Field>
              <Field id={`at-${m.id}`} label="Shoot-out (away)" className="w-32">
                <Input {...fieldA11y(`at-${m.id}`)} type="number" min={0} inputMode="numeric" value={v.at} onChange={(e) => setV({ ...v, at: e.target.value })} />
              </Field>
            </>
          )}
          <Button type="submit" loading={busy === `res-${m.id}`}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEdit(false)}>
            Cancel
          </Button>
        </form>
      )}
    </li>
  );
}

// ---------- Podium ----------
export type PlacingRow = { division: string | null; position: number; entrantKey: string; mark: string };
export type EntrantOption = { key: string; label: string; division: string | null };

export function PodiumForm({ eventId, initial, entrants, divisions, final, race }: { eventId: string; initial: PlacingRow[]; entrants: EntrantOption[]; divisions: Array<string | null>; final: boolean; race: boolean }) {
  const { run, busy } = useCompOp(eventId);
  const blank = (division: string | null): PlacingRow[] => [1, 2, 3].map((position) => ({ division, position, entrantKey: "", mark: "" }));
  const [rows, setRows] = useState<PlacingRow[]>(() => (initial.length ? initial : divisions.flatMap(blank)));
  const set = (i: number, patch: Partial<PlacingRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  if (final) {
    return (
      <div className="space-y-3">
        <p className="text-muted">Results are final. Reopen them to make changes (only possible before medal certificates are issued).</p>
        <Button variant="outline" loading={busy === "reopen"} onClick={() => run({ op: "reopen" }, "Results reopened")}>
          Reopen results
        </Button>
      </div>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const placings = rows
          .filter((r) => r.entrantKey)
          .map((r) => {
            const [kind, id] = r.entrantKey.split(":");
            return { division: r.division, position: r.position, teamId: kind === "t" ? id : null, studentId: kind === "s" ? id : null, mark: r.mark || null };
          });
        void run({ op: "finalise", placings }, "Results finalised");
      }}
    >
      {divisions.map((d) => (
        <fieldset key={d ?? "all"} className="space-y-2">
          {d && <legend className="font-semibold">{d}</legend>}
          {rows.map((r, i) =>
            r.division !== d ? null : (
              <div key={i} className="grid grid-cols-[3.5rem_1fr] gap-2 sm:grid-cols-[3.5rem_1fr_9rem]">
                <Input aria-label="Position" type="number" min={1} max={50} value={r.position} onChange={(e) => set(i, { position: Number(e.target.value) })} className="text-center font-mono" />
                <Select aria-label={`Position ${r.position}`} value={r.entrantKey} onChange={(e) => set(i, { entrantKey: e.target.value })}>
                  <option value="">— choose —</option>
                  {entrants.filter((en) => en.division === d).map((en) => (
                    <option key={en.key} value={en.key}>
                      {en.label}
                    </option>
                  ))}
                </Select>
                {race && <Input aria-label="Mark (time, distance or score)" placeholder="e.g. 11.42 s" value={r.mark} onChange={(e) => set(i, { mark: e.target.value })} className="col-span-2 sm:col-span-1" />}
              </div>
            ),
          )}
          <Button type="button" size="sm" variant="ghost" icon={<Plus className="size-4" aria-hidden />} onClick={() => setRows([...rows, { division: d, position: Math.max(0, ...rows.filter((r) => r.division === d).map((r) => r.position)) + 1, entrantKey: "", mark: "" }])}>
            Add position
          </Button>
        </fieldset>
      ))}
      <p className="text-small text-muted">Two entrants may share a position (e.g. joint bronze in knockout events).</p>
      <Button type="submit" variant="success" loading={busy === "finalise"} icon={<Award className="size-4" aria-hidden />}>
        Finalise results
      </Button>
    </form>
  );
}

// ---------- Certificates ----------
export type CertView = { code: string; recipient: string; kind: string; division: string | null; revoked: boolean };

export function CertificatesPanel({ eventId, certs, canIssue }: { eventId: string; certs: CertView[]; canIssue: boolean }) {
  const { run, busy } = useCompOp(eventId);
  const router = useRouter();
  const toast = useToast();
  const [revoke, setRevoke] = useState<CertView | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string>();
  const [loading, setLoading] = useState(false);
  return (
    <div className="space-y-4">
      <Button onClick={() => run<{ issued: number }>({ op: "certificates" }, (d) => (d.issued ? `${d.issued} certificates issued` : "Everyone already has their certificate"))} loading={busy === "certificates"} disabled={!canIssue} icon={<Award className="size-4" aria-hidden />}>
        Issue certificates
      </Button>
      {!canIssue && <p className="text-small text-muted">Finalise the results first, so medal certificates go to the right people.</p>}
      {certs.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {certs.map((c) => (
            <li key={c.code} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{c.recipient}</span>
                <span className="block font-mono text-small text-muted">
                  {c.code} · {c.kind.toLowerCase()}
                  {c.division ? ` · ${c.division}` : ""}
                </span>
              </span>
              {c.revoked ? (
                <Badge tone="danger">Revoked</Badge>
              ) : (
                <>
                  <a href={`/api/certificates/${c.code}`} target="_blank" rel="noopener" className={buttonClass("ghost", "sm")}>
                    PDF
                  </a>
                  <Link href={`/verify/${c.code}`} target="_blank" className={buttonClass("ghost", "sm")}>
                    Verify page
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => (setRevoke(c), setReason(""), setErr(undefined))}>
                    Revoke
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!revoke}
        onClose={() => setRevoke(null)}
        tone="danger"
        confirmLabel="Revoke"
        loading={loading}
        title={`Revoke ${revoke?.code}?`}
        description="The public verify page will show it as revoked from now on. This can't be undone."
        onConfirm={async () => {
          if (reason.trim().length < 5) return setErr("Give a reason (at least 5 characters)");
          setLoading(true);
          const r = await api("/api/admin/certificates", { body: { code: revoke?.code, reason } });
          setLoading(false);
          if (!r.ok) return setErr(r.error);
          setRevoke(null);
          toast.success("Certificate revoked");
          router.refresh();
        }}
      >
        <Field id="revoke-reason" label="Reason" error={err} required>
          <Textarea {...fieldA11y("revoke-reason", err)} rows={3} value={reason} onChange={(e) => (setReason(e.target.value), setErr(undefined))} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
