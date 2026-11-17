"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, fieldA11y } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client-api";

export type TournamentRow = {
  id: string;
  name: string;
  season: string;
  startDate: string | null;
  endDate: string | null;
  opensAt: string; // "YYYY-MM-DDTHH:mm" Indian time, or ""
  closesAt: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  events: number;
  entries: number;
  /** Plain-words registration state, computed on the server, e.g. "Registration open until 15 Aug 2027, 11:59 pm". */
  registrationNote: string;
  registrationOpen: boolean;
};
export type EventRow = {
  id: string;
  label: string;
  tournamentId: string | null;
};


type Form = {
  name: string;
  season: string;
  startDate: string;
  endDate: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  status: TournamentRow["status"];
};
const empty = (): Form => {
  const y = new Date().getFullYear();
  return {
    name: "",
    season: `${y}-${String((y + 1) % 100).padStart(2, "0")}`,
    startDate: "",
    endDate: "",
    registrationOpensAt: "",
    registrationClosesAt: "",
    status: "DRAFT",
  };
};

function useOp() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(
    body: Record<string, unknown>,
    success: string,
    key: string,
  ): Promise<{ ok: boolean; fieldErrors: Record<string, string> }> {
    setBusy(key);
    const r = await api("/api/admin/tournaments", { body });
    setBusy(null);
    if (!r.ok) {
      toast.error("Not saved", r.error);
      return { ok: false, fieldErrors: r.fieldErrors };
    }
    toast.success(success);
    router.refresh();
    return { ok: true, fieldErrors: {} };
  }
  return { run, busy };
}

function TournamentForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: Form;
  submitLabel: string;
  busy: boolean;
  onSubmit: (f: Form) => Promise<Record<string, string> | null>;
  onCancel?: () => void;
}) {
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set =
    (k: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setErrors((await onSubmit(f)) ?? {});
      }}
    >
      <Field
        id="t-name"
        label="Tournament name"
        error={errors.name}
        required
        className="sm:col-span-2"
      >
        <Input
          {...fieldA11y("t-name", errors.name)}
          value={f.name}
          onChange={set("name")}
          placeholder="e.g. Hoop It Up 2027"
        />
      </Field>
      <Field
        id="t-season"
        label="Season"
        error={errors.season}
        hint="e.g. 2027-28"
        required
      >
        <Input
          {...fieldA11y("t-season", errors.season, true)}
          value={f.season}
          onChange={set("season")}
          className="font-mono"
        />
      </Field>
      <Field
        id="t-status"
        label="Status"
        error={errors.status}
        hint="Students can register only while Active and inside the window below."
        required
      >
        <Select
          {...fieldA11y("t-status", errors.status, true)}
          value={f.status}
          onChange={set("status")}
        >
          <option value="DRAFT">Being set up (registration closed)</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived (finished, kept as history)</option>
        </Select>
      </Field>
      <Field id="t-start" label="First day" error={errors.startDate}>
        <Input
          {...fieldA11y("t-start", errors.startDate)}
          type="date"
          value={f.startDate}
          onChange={set("startDate")}
        />
      </Field>
      <Field id="t-end" label="Last day" error={errors.endDate}>
        <Input
          {...fieldA11y("t-end", errors.endDate)}
          type="date"
          value={f.endDate}
          onChange={set("endDate")}
        />
      </Field>
      <Field
        id="t-opens"
        label="Registration opens (Indian time)"
        error={errors.registrationOpensAt}
        hint="Leave empty to open as soon as the tournament is Active."
      >
        <Input
          {...fieldA11y("t-opens", errors.registrationOpensAt, true)}
          type="datetime-local"
          value={f.registrationOpensAt}
          onChange={set("registrationOpensAt")}
        />
      </Field>
      <Field
        id="t-closes"
        label="Registration closes (Indian time)"
        error={errors.registrationClosesAt}
        hint="After this, students can't add or change events in this tournament."
      >
        <Input
          {...fieldA11y("t-closes", errors.registrationClosesAt, true)}
          type="datetime-local"
          value={f.registrationClosesAt}
          onChange={set("registrationClosesAt")}
        />
      </Field>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export function TournamentsPanel({
  tournaments,
  events,
}: {
  tournaments: TournamentRow[];
  events: EventRow[];
}) {
  const { run, busy } = useOp();
  const [adding, setAdding] = useState(tournaments.length === 0);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TournamentRow | null>(null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Tournaments"
          description="Each tournament groups its events and sets when students can register for them."
          action={
            !adding && (
              <Button
                size="sm"
                icon={<Plus className="size-4" aria-hidden />}
                onClick={() => setAdding(true)}
              >
                New tournament
              </Button>
            )
          }
        />
        <CardBody className="space-y-4">
          {adding && (
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <p className="mb-3 font-semibold">New tournament</p>
              <TournamentForm
                initial={empty()}
                submitLabel="Create tournament"
                busy={busy === "create"}
                onCancel={
                  tournaments.length ? () => setAdding(false) : undefined
                }
                onSubmit={async (f) => {
                  const r = await run(
                    { op: "create", ...f },
                    "Tournament created",
                    "create",
                  );
                  if (r.ok) setAdding(false);
                  return r.ok ? null : r.fieldErrors;
                }}
              />
            </div>
          )}
          {tournaments.length === 0 && !adding && (
            <p className="text-muted">No tournaments yet.</p>
          )}
          <ul className="space-y-3">
            {tournaments.map((t) => (
              <li key={t.id} className="rounded-xl border border-border p-4">
                {editing === t.id ? (
                  <TournamentForm
                    initial={{
                      name: t.name,
                      season: t.season,
                      startDate: t.startDate ?? "",
                      endDate: t.endDate ?? "",
                      registrationOpensAt: t.opensAt,
                      registrationClosesAt: t.closesAt,
                      status: t.status,
                    }}
                    submitLabel="Save changes"
                    busy={busy === `upd-${t.id}`}
                    onCancel={() => setEditing(null)}
                    onSubmit={async (f) => {
                      const r = await run(
                        { op: "update", id: t.id, ...f },
                        "Tournament saved",
                        `upd-${t.id}`,
                      );
                      if (r.ok) setEditing(null);
                      return r.ok ? null : r.fieldErrors;
                    }}
                  />
                ) : (
                  <div className="flex flex-wrap items-start gap-3">
                    <CalendarRange
                      className="mt-1 size-5 shrink-0 text-muted"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold">{t.name}</p>
                        {t.status !== "ACTIVE" && <StatusPill status={t.status} />}
                        <StatusPill status={t.registrationOpen ? "REG_OPEN" : "REG_CLOSED"} />
                        <span className="text-small text-muted">
                          Season {t.season}
                        </span>
                      </div>
                      <p className="text-small text-muted">
                        {t.startDate
                          ? `${t.startDate}${t.endDate && t.endDate !== t.startDate ? ` to ${t.endDate}` : ""}`
                          : "Dates not set"}{" "}
                        · {t.events} event{t.events === 1 ? "" : "s"} ·{" "}
                        {t.entries} entr{t.entries === 1 ? "y" : "ies"}
                      </p>
                      <p
                        className={`mt-1 text-small font-semibold ${t.registrationOpen ? "text-success-fg" : "text-muted"}`}
                      >
                        {t.registrationNote}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Pencil className="size-4" aria-hidden />}
                        onClick={() => setEditing(t.id)}
                      >
                        Edit
                      </Button>
                      {t.events === 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 className="size-4" aria-hidden />}
                          onClick={() => setDeleting(t)}
                          aria-label={`Delete ${t.name}`}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {tournaments.length > 0 && (
        <Card>
          <CardHeader
            title="Events by tournament"
            description="Move an event to the tournament it belongs to. Its registration window then follows that tournament."
          />
          <CardBody>
            <ul className="divide-y divide-border">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0">{e.label}</span>
                  <div className="w-full sm:w-80">
                    <Select
                      aria-label={`Tournament for ${e.label}`}
                      value={e.tournamentId ?? ""}
                      disabled={busy === `as-${e.id}`}
                      onChange={(ev) =>
                        ev.target.value &&
                        void run(
                          {
                            op: "assign",
                            eventId: e.id,
                            tournamentId: ev.target.value,
                          },
                          "Event moved",
                          `as-${e.id}`,
                        )
                      }
                    >
                      {!e.tournamentId && (
                        <option value="">No tournament</option>
                      )}
                      {tournaments.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this tournament?"
        description={
          deleting
            ? `${deleting.name} has no events, so nothing else is affected.`
            : undefined
        }
        confirmLabel="Delete"
        tone="danger"
        loading={busy === "del"}
        onConfirm={async () => {
          if (!deleting) return;
          const r = await run(
            { op: "delete", id: deleting.id },
            "Tournament deleted",
            "del",
          );
          if (r.ok) setDeleting(null);
        }}
      />
    </div>
  );
}
