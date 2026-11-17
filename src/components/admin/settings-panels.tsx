"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client-api";
import { ADMIN_ROLES, ROLE_LABEL, STAFF_ROLES, type StaffRole } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";

type Op = Record<string, unknown> & { op: string };

function useOp() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function run(body: Op, success: string, key = body.op): Promise<boolean> {
    setBusy(key);
    setErrors({});
    const r = await api<{ purged?: number }>("/api/admin/settings", { body });
    setBusy(null);
    if (!r.ok) {
      setErrors(r.fieldErrors);
      toast.error("Not saved", r.error);
      return false;
    }
    toast.success(success);
    router.refresh();
    return true;
  }
  return { run, busy, errors };
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader title={title} description={description} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

// ---------- General ----------
export function GeneralPanel({ initial }: { initial: { ageCutoffDate: string; retentionDays: number; meetName: string } }) {
  const { run, busy, errors } = useOp();
  const [v, setV] = useState({ ...initial, retentionDays: String(initial.retentionDays) });
  return (
    <Section id="general" title="General" description="Age categories are calculated on the cutoff date. Retention controls automatic deletion.">
      <form
        className="grid gap-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run({ op: "general", ...v }, "Settings saved");
        }}
      >
        <Field id="meetName" label="Competition name" error={errors.meetName} className="sm:col-span-3">
          <Input {...fieldA11y("meetName", errors.meetName)} value={v.meetName} onChange={(e) => setV({ ...v, meetName: e.target.value })} />
        </Field>
        <Field id="ageCutoffDate" label="Age cutoff date" error={errors.ageCutoffDate}>
          <Input {...fieldA11y("ageCutoffDate", errors.ageCutoffDate)} type="date" value={v.ageCutoffDate} onChange={(e) => setV({ ...v, ageCutoffDate: e.target.value })} />
        </Field>
        <Field id="retentionDays" label="Data retention (days)" error={errors.retentionDays} hint="Drafts and rejected records older than this are purged.">
          <Input {...fieldA11y("retentionDays", errors.retentionDays, true)} type="number" inputMode="numeric" min={30} value={v.retentionDays} onChange={(e) => setV({ ...v, retentionDays: e.target.value })} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" loading={busy === "general"}>
            Save settings
          </Button>
        </div>
      </form>
    </Section>
  );
}

// ---------- Age categories ----------
export function AgeCategoriesPanel({ categories }: { categories: Array<{ id: string; name: string; maxAge: number | null }> }) {
  const { run, busy } = useOp();
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(categories.map((c) => [c.id, c.maxAge === null ? "" : String(c.maxAge)])));
  return (
    <Section id="age" title="Age categories" description="An athlete is placed in the youngest category where their age on the cutoff date is below the limit. Leave blank for Open.">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((c) => (
          <li key={c.id} className="rounded-xl border border-border p-3">
            <p className="font-heading text-xl font-semibold">{c.name}</p>
            <div className="mt-2 flex items-end gap-2">
              <Field id={`age-${c.id}`} label="Under age">
                <Input {...fieldA11y(`age-${c.id}`)} type="number" inputMode="numeric" value={vals[c.id]} onChange={(e) => setVals({ ...vals, [c.id]: e.target.value })} className="w-24" />
              </Field>
              <Button variant="outline" size="sm" loading={busy === `age-${c.id}`} onClick={() => run({ op: "age-category", id: c.id, maxAge: vals[c.id] === "" ? null : Number(vals[c.id]) }, `${c.name} updated`, `age-${c.id}`)}>
                Save
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------- Campuses & schools ----------
type CampusRow = { id: string; name: string; code: string; active: boolean; schools: Array<{ id: string; name: string; code: string; active: boolean; students: number; teams: number }> };

export function CampusesPanel({ campuses }: { campuses: CampusRow[] }) {
  const { run, busy, errors } = useOp();
  const [campus, setCampus] = useState({ name: "", code: "" });
  const [school, setSchool] = useState({ campusId: campuses[0]?.id ?? "", name: "", code: "" });
  return (
    <Section id="campuses" title="Campuses & schools" description="Host-university students are linked to their school automatically from the ERP (by school code), so they can't claim another school to join its squad.">
      <div className="space-y-3">
        {campuses.map((c) => (
          <div key={c.id} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-heading text-lg font-semibold">{c.name}</span>
              <Badge>{c.code}</Badge>
              {!c.active && <Badge tone="warning">Inactive</Badge>}
              <Button variant="ghost" size="sm" className="ml-auto" loading={busy === `campus-${c.id}`} onClick={() => run({ op: "campus-toggle", id: c.id, active: !c.active }, "Campus updated", `campus-${c.id}`)}>
                {c.active ? "Set inactive" : "Activate"}
              </Button>
            </div>
            <ul className="mt-2 space-y-1">
              {c.schools.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    {s.name} <span className="font-mono text-small text-muted">{s.code}</span>
                    <span className="block text-small text-muted">
                      {s.students} students · {s.teams} teams
                    </span>
                  </span>
                  {!s.active && <Badge tone="warning">Inactive</Badge>}
                  <Button variant="ghost" size="sm" loading={busy === `school-${s.id}`} onClick={() => run({ op: "school-toggle", id: s.id, active: !s.active }, "School updated", `school-${s.id}`)}>
                    {s.active ? "Set inactive" : "Activate"}
                  </Button>
                </li>
              ))}
              {c.schools.length === 0 && <li className="text-small text-muted">No schools yet.</li>}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <form
          className="grid gap-3 rounded-xl border border-dashed border-border-strong p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run({ op: "campus-add", ...campus }, `${campus.name} added`)) setCampus({ name: "", code: "" });
          }}
        >
          <p className="font-semibold">Add a campus</p>
          <Field id="campus-name" label="Name" error={errors.name}>
            <Input {...fieldA11y("campus-name", errors.name)} placeholder="e.g. Bangalore" value={campus.name} onChange={(e) => setCampus({ ...campus, name: e.target.value })} />
          </Field>
          <Field id="campus-code" label="Short code" hint="Shown where the full name won't fit" error={errors.code}>
            <Input {...fieldA11y("campus-code", errors.code, true)} placeholder="BLR" maxLength={6} className="font-mono uppercase" value={campus.code} onChange={(e) => setCampus({ ...campus, code: e.target.value.toUpperCase() })} />
          </Field>
          <div>
            <Button type="submit" variant="outline" loading={busy === "campus-add"} icon={<Plus className="size-4" aria-hidden />}>
              Add campus
            </Button>
          </div>
        </form>
        <form
          className="grid gap-3 rounded-xl border border-dashed border-border-strong p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run({ op: "school-add", ...school }, `${school.name} added`)) setSchool({ ...school, name: "", code: "" });
          }}
        >
          <p className="font-semibold">Add a school</p>
          <Field id="school-campus" label="Campus" error={errors.campusId}>
            <Select {...fieldA11y("school-campus", errors.campusId)} value={school.campusId} onChange={(e) => setSchool({ ...school, campusId: e.target.value })}>
              <option value="">Choose…</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="school-name" label="Name" error={errors.name}>
            <Input {...fieldA11y("school-name", errors.name)} placeholder="e.g. School of Design" value={school.name} onChange={(e) => setSchool({ ...school, name: e.target.value })} />
          </Field>
          <Field id="school-code" label="ERP school code" hint="Must match the code in the university ERP" error={errors.code}>
            <Input {...fieldA11y("school-code", errors.code, true)} placeholder="DES" maxLength={6} className="font-mono uppercase" value={school.code} onChange={(e) => setSchool({ ...school, code: e.target.value.toUpperCase() })} />
          </Field>
          <div>
            <Button type="submit" variant="outline" loading={busy === "school-add"} icon={<Plus className="size-4" aria-hidden />}>
              Add school
            </Button>
          </div>
        </form>
      </div>
    </Section>
  );
}

// ---------- Sports, events, weight categories ----------
/** Entry limit, minimum squad and age restriction for one event. */
function EventLimits({ event, ageCategories }: { event: SportRow["events"][number]; ageCategories: AgeOption[] }) {
  const { run, busy, errors } = useOp();
  const [v, setV] = useState({ minEntries: event.minEntries?.toString() ?? "", maxEntries: event.maxEntries?.toString() ?? "", ageCategoryId: event.ageCategoryId ?? "" });
  const id = (k: string) => `${k}-${event.id}`;
  return (
    <form
      className="grid w-full gap-2 sm:grid-cols-[1fr_1fr_1.2fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        void run({ op: "event-limits", id: event.id, minEntries: v.minEntries || null, maxEntries: v.maxEntries || null, ageCategoryId: v.ageCategoryId || null }, "Event limits saved", id("lim"));
      }}
    >
      <Field id={id("min")} label="Min. squad" error={errors.minEntries}>
        <Input {...fieldA11y(id("min"), errors.minEntries)} type="number" min={1} inputMode="numeric" placeholder="—" value={v.minEntries} onChange={(e) => setV({ ...v, minEntries: e.target.value })} />
      </Field>
      <Field id={id("max")} label="Entry limit" error={errors.maxEntries}>
        <Input {...fieldA11y(id("max"), errors.maxEntries)} type="number" min={1} inputMode="numeric" placeholder="No limit" value={v.maxEntries} onChange={(e) => setV({ ...v, maxEntries: e.target.value })} />
      </Field>
      <Field id={id("age")} label="Age limit">
        <Select {...fieldA11y(id("age"))} value={v.ageCategoryId} onChange={(e) => setV({ ...v, ageCategoryId: e.target.value })}>
          <option value="">Open to all ages</option>
          {ageCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} only
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" variant="outline" loading={busy === id("lim")}>
        Save
      </Button>
    </form>
  );
}

type SportRow = {
  id: string;
  name: string;
  active: boolean;
  isWeightCategory: boolean;
  isTeam: boolean;
  events: Array<{ id: string; name: string; gender: string; eventDate: string | null; venue: string | null; active: boolean; minEntries: number | null; maxEntries: number | null; ageCategoryId: string | null; _count: { registrations: number } }>;
  weightCategories: Array<{ id: string; name: string; gender: string }>;
};

type AgeOption = { id: string; name: string };

export function SportsPanel({ sports, ageCategories }: { sports: SportRow[]; ageCategories: AgeOption[] }) {
  const { run, busy, errors } = useOp();
  const [add, setAdd] = useState({ name: "", isTeam: false, isWeightCategory: false, positions: "" });
  return (
    <Section id="sports" title="Sports, events & weight categories">
      <div className="space-y-3">
        {sports.map((s) => (
          <SportItem key={s.id} sport={s} ageCategories={ageCategories} />
        ))}
      </div>
      <form
        className="mt-6 grid gap-3 rounded-xl border border-dashed border-border-strong p-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run({ op: "sport-add", ...add }, `${add.name} added`)) setAdd({ name: "", isTeam: false, isWeightCategory: false, positions: "" });
        }}
      >
        <p className="font-semibold sm:col-span-2">Add a sport</p>
        <Field id="sport-name" label="Name" error={errors.name}>
          <Input {...fieldA11y("sport-name", errors.name)} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
        </Field>
        <Field id="sport-positions" label="Playing positions" hint="Comma-separated, optional">
          <Input {...fieldA11y("sport-positions", undefined, true)} value={add.positions} onChange={(e) => setAdd({ ...add, positions: e.target.value })} />
        </Field>
        <Checkbox id="sport-team" label="Team sport" checked={add.isTeam} onChange={(e) => setAdd({ ...add, isTeam: e.target.checked })} />
        <Checkbox id="sport-weight" label="Uses weight categories (needs weigh-ins)" checked={add.isWeightCategory} onChange={(e) => setAdd({ ...add, isWeightCategory: e.target.checked })} />
        <div>
          <Button type="submit" loading={busy === "sport-add"} icon={<Plus className="size-4" aria-hidden />}>
            Add sport
          </Button>
        </div>
      </form>
    </Section>
  );
}

function SportItem({ sport, ageCategories }: { sport: SportRow; ageCategories: AgeOption[] }) {
  const { run, busy, errors } = useOp();
  const [ev, setEv] = useState({ name: "", gender: "MALE", eventDate: "", venue: "" });
  const [wc, setWc] = useState({ name: "", gender: "MALE", minKg: "", maxKg: "" });
  const regs = sport.events.reduce((a, e) => a + e._count.registrations, 0);
  return (
    <details className="rounded-xl border border-border">
      <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-2">
        <span className="font-heading text-lg font-semibold">{sport.name}</span>
        {!sport.active && <Badge tone="danger">Disabled</Badge>}
        {sport.isWeightCategory && <Badge tone="info">Weight classes</Badge>}
        {sport.isTeam && <Badge>Team</Badge>}
        <span className="ml-auto text-small text-muted">
          {sport.events.length} events · {regs} entries
        </span>
      </summary>
      <div className="space-y-5 border-t border-border p-4">
        <Button variant={sport.active ? "outline" : "secondary"} size="sm" loading={busy === "sport-toggle"} onClick={() => run({ op: "sport-toggle", id: sport.id, active: !sport.active }, `${sport.name} ${sport.active ? "disabled" : "enabled"}`)}>
          {sport.active ? "Disable sport" : "Enable sport"}
        </Button>

        <div>
          <p className="mb-2 font-semibold">Events</p>
          <ul className="space-y-2">
            {sport.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  {e.name} <span className="text-small text-muted">· {e.gender.toLowerCase()} · {e.eventDate ?? "date TBC"} · {e._count.registrations} entries</span>
                </span>
                {!e.active && <Badge tone="danger">Disabled</Badge>}
                <Button variant="ghost" size="sm" loading={busy === `ev-${e.id}`} onClick={() => run({ op: "event-toggle", id: e.id, active: !e.active }, "Event updated", `ev-${e.id}`)}>
                  {e.active ? "Disable" : "Enable"}
                </Button>
                <EventLimits event={e} ageCategories={ageCategories} />
              </li>
            ))}
          </ul>
          <form
            className="mt-3 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1.5fr_auto]"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run({ op: "event-add", sportId: sport.id, ...ev }, "Event added")) setEv({ name: "", gender: "MALE", eventDate: "", venue: "" });
            }}
          >
            <label>
              <span className="sr-only">Event name</span>
              <Input placeholder="New event name" value={ev.name} onChange={(e) => setEv({ ...ev, name: e.target.value })} aria-invalid={errors.name ? true : undefined} />
            </label>
            <label>
              <span className="sr-only">Gender</span>
              <Select value={ev.gender} onChange={(e) => setEv({ ...ev, gender: e.target.value })}>
                <option value="MALE">Men</option>
                <option value="FEMALE">Women</option>
                <option value="MIXED">Mixed / open</option>
              </Select>
            </label>
            <label>
              <span className="sr-only">Date</span>
              <Input type="date" value={ev.eventDate} onChange={(e) => setEv({ ...ev, eventDate: e.target.value })} />
            </label>
            <label>
              <span className="sr-only">Venue</span>
              <Input placeholder="Venue" value={ev.venue} onChange={(e) => setEv({ ...ev, venue: e.target.value })} />
            </label>
            <Button type="submit" variant="outline" loading={busy === "event-add"} icon={<Plus className="size-4" aria-hidden />}>
              Add
            </Button>
          </form>
        </div>

        {sport.isWeightCategory && (
          <div>
            <p className="mb-2 font-semibold">Weight categories</p>
            {(["MALE", "FEMALE"] as const).map((g) => (
              <div key={g} className="mb-2">
                <p className="text-small text-muted">{g === "MALE" ? "Men" : "Women"}</p>
                <ul className="flex flex-wrap gap-2">
                  {sport.weightCategories
                    .filter((w) => w.gender === g)
                    .map((w) => (
                      <li key={w.id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pr-1 pl-3 text-small">
                        {w.name}
                        <button type="button" aria-label={`Delete ${w.name}`} onClick={() => run({ op: "weight-delete", id: w.id }, "Weight category deleted", `w-${w.id}`)} className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface hover:text-danger-fg">
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            <form
              className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await run({ op: "weight-add", sportId: sport.id, gender: wc.gender, name: wc.name, minKg: wc.minKg ? Number(wc.minKg) : null, maxKg: wc.maxKg ? Number(wc.maxKg) : null }, "Weight category added");
                if (ok) setWc({ name: "", gender: wc.gender, minKg: "", maxKg: "" });
              }}
            >
              <label>
                <span className="sr-only">Category name</span>
                <Input placeholder="e.g. −61 kg" value={wc.name} onChange={(e) => setWc({ ...wc, name: e.target.value })} />
              </label>
              <label>
                <span className="sr-only">Gender</span>
                <Select value={wc.gender} onChange={(e) => setWc({ ...wc, gender: e.target.value })}>
                  <option value="MALE">Men</option>
                  <option value="FEMALE">Women</option>
                </Select>
              </label>
              <label>
                <span className="sr-only">Above (kg)</span>
                <Input type="number" inputMode="decimal" step="0.1" placeholder="Above kg" value={wc.minKg} onChange={(e) => setWc({ ...wc, minKg: e.target.value })} />
              </label>
              <label>
                <span className="sr-only">Up to (kg)</span>
                <Input type="number" inputMode="decimal" step="0.1" placeholder="Up to kg" value={wc.maxKg} onChange={(e) => setWc({ ...wc, maxKg: e.target.value })} />
              </label>
              <Button type="submit" variant="outline" loading={busy === "weight-add"} icon={<Plus className="size-4" aria-hidden />}>
                Add
              </Button>
            </form>
          </div>
        )}
      </div>
    </details>
  );
}

// ---------- Staff ----------
type StaffRow = { id: string; name: string; email: string; role: string; active: boolean; lastLoginAt: string | null; sport: string | null };

export function StaffPanel({ staff, sports, currentId, isSuperAdmin }: { staff: StaffRow[]; sports: Array<{ id: string; name: string }>; currentId: string; isSuperAdmin: boolean }) {
  // Admin and super-admin accounts can only be managed by a super admin (the server enforces this too).
  const canManage = (role: string) => isSuperAdmin || !(ADMIN_ROLES as readonly string[]).includes(role);
  const { run, busy, errors } = useOp();
  const [add, setAdd] = useState({ name: "", email: "", role: "OFFICIAL" as StaffRole, password: "", sportId: "" });
  const [reset, setReset] = useState<StaffRow | null>(null);
  const [pw, setPw] = useState("");
  return (
    <Section id="staff" title="Staff users">
      <ul className="divide-y divide-border">
        {staff.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {u.name} {!u.active && <Badge tone="danger">Deactivated</Badge>}
              </p>
              <p className="text-small break-all text-muted">
                {u.email} · {ROLE_LABEL[u.role as StaffRole] ?? u.role}
                {u.sport && ` (${u.sport})`} · last login {formatDateTime(u.lastLoginAt)}
              </p>
            </div>
            {canManage(u.role) && (
              <Button variant="ghost" size="sm" onClick={() => { setPw(""); setReset(u); }}>
                Reset password
              </Button>
            )}
            {u.id !== currentId && canManage(u.role) && (
              <Button variant="outline" size="sm" loading={busy === `st-${u.id}`} onClick={() => run({ op: "staff-update", id: u.id, active: !u.active }, u.active ? "Account deactivated" : "Account reactivated", `st-${u.id}`)}>
                {u.active ? "Deactivate" : "Reactivate"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="mt-6 grid gap-3 rounded-xl border border-dashed border-border-strong p-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run({ op: "staff-add", ...add, sportId: add.sportId || undefined }, "Staff account created")) setAdd({ name: "", email: "", role: "OFFICIAL", password: "", sportId: "" });
        }}
      >
        <p className="font-semibold sm:col-span-2">Add staff user</p>
        <Field id="st-name" label="Full name" error={errors.name}>
          <Input {...fieldA11y("st-name", errors.name)} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
        </Field>
        <Field id="st-email" label="Email" error={errors.email}>
          <Input {...fieldA11y("st-email", errors.email)} type="email" inputMode="email" autoComplete="off" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} />
        </Field>
        <Field id="st-role" label="Role">
          <Select {...fieldA11y("st-role")} value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value as StaffRole })}>
            {STAFF_ROLES.filter((r) => canManage(r)).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        {add.role === "COACH" && (
          <Field id="st-sport" label="Coach's sport" error={errors.sportId}>
            <Select {...fieldA11y("st-sport", errors.sportId)} value={add.sportId} onChange={(e) => setAdd({ ...add, sportId: e.target.value })}>
              <option value="">Choose…</option>
              {sports.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field id="st-password" label="Initial password" error={errors.password} hint="10+ characters with upper, lower case and a number">
          <Input {...fieldA11y("st-password", errors.password, true)} type="password" autoComplete="new-password" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" loading={busy === "staff-add"} icon={<Plus className="size-4" aria-hidden />}>
            Create account
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={!!reset}
        onClose={() => setReset(null)}
        title={`Reset password for ${reset?.name ?? ""}`}
        confirmLabel="Set password"
        loading={busy === "staff-update"}
        onConfirm={async () => {
          if (reset && (await run({ op: "staff-update", id: reset.id, password: pw }, "Password reset"))) setReset(null);
        }}
      >
        <Field id="reset-pw" label="New password" error={errors.password} hint="10+ characters with upper, lower case and a number">
          <Input {...fieldA11y("reset-pw", errors.password, true)} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
      </ConfirmDialog>
    </Section>
  );
}

// ---------- Deletion requests & retention ----------
type DelRow = { id: string; studentId: string | null; studentLabel: string; reason: string | null; status: string; createdAt: string; processedAt: string | null };

export function DeletionPanel({ requests, retentionDays }: { requests: DelRow[]; retentionDays: number }) {
  const { run, busy, errors } = useOp();
  const [complete, setComplete] = useState<DelRow | null>(null);
  const [decline, setDecline] = useState<DelRow | null>(null);
  const [why, setWhy] = useState("");
  const [purge, setPurge] = useState(false);
  const pending = requests.filter((r) => r.status === "PENDING");
  return (
    <Section id="deletion" title="Data deletion & retention" description="Requests made by students under the DPDP Act. Completing a request permanently deletes their profile and files.">
      {pending.length === 0 ? (
        <p className="text-muted">No pending deletion requests.</p>
      ) : (
        <ul className="space-y-2">
          {pending.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{r.studentLabel}</p>
                <p className="text-small text-muted">
                  Requested {formatDateTime(r.createdAt)}
                  {r.reason && ` · “${r.reason}”`}
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setComplete(r)}>
                Delete data
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setWhy(""); setDecline(r); }}>
                Decline
              </Button>
            </li>
          ))}
        </ul>
      )}
      {requests.some((r) => r.status !== "PENDING") && (
        <details className="mt-4">
          <summary className="min-h-11 cursor-pointer content-center text-small font-medium text-muted">Processed requests</summary>
          <ul className="mt-2 space-y-1 text-small">
            {requests
              .filter((r) => r.status !== "PENDING")
              .map((r) => (
                <li key={r.id}>
                  {r.studentLabel} — {r.status.toLowerCase()} {formatDateTime(r.processedAt)}
                </li>
              ))}
          </ul>
        </details>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <p className="min-w-0 flex-1 text-small text-muted">Retention purge deletes drafts and rejected registrations inactive for more than {retentionDays} days, plus expired OTP records.</p>
        <Button variant="outline" onClick={() => setPurge(true)}>
          Run retention purge
        </Button>
      </div>

      <ConfirmDialog open={!!complete} onClose={() => setComplete(null)} tone="danger" confirmLabel="Delete permanently" loading={busy === "deletion-complete"} title="Delete this student's data?" description={`${complete?.studentLabel ?? ""}: profile, documents, registrations and Sports ID will be erased. This cannot be undone.`} onConfirm={async () => { if (complete && (await run({ op: "deletion-complete", id: complete.id }, "Data deleted"))) setComplete(null); }} />
      <ConfirmDialog open={!!decline} onClose={() => setDecline(null)} confirmLabel="Decline request" loading={busy === "deletion-decline"} title="Decline deletion request?" description="e.g. the student is competing in an ongoing event; data must be kept until results are final." onConfirm={async () => { if (decline && (await run({ op: "deletion-decline", id: decline.id, reason: why }, "Request declined"))) setDecline(null); }}>
        <Field id="decline-reason" label="Reason" error={errors.reason} required>
          <Textarea {...fieldA11y("decline-reason", errors.reason)} rows={3} value={why} onChange={(e) => setWhy(e.target.value)} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog open={purge} onClose={() => setPurge(false)} tone="danger" confirmLabel="Run purge" loading={busy === "retention-purge"} title="Run retention purge now?" description="Stale drafts and rejected registrations past the retention period are permanently deleted." onConfirm={async () => { if (await run({ op: "retention-purge" }, "Retention purge complete")) setPurge(false); }} />
    </Section>
  );
}
