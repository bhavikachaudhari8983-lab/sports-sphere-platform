"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Check, Info, MapPin, Scale } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FieldError, Input, Select, fieldA11y } from "@/components/ui/field";
import { Alert } from "@/components/ui/badge";
import { sportsSchema } from "@/lib/validation/registration";
import { cn, formatDob } from "@/lib/utils";
import { ageOn } from "@/lib/age";
import { useStepValidator, useWizard } from "../wizard-context";
import { useSection } from "../use-section";
import { DocumentUpload } from "../document-upload";

type Reg = { eventId: string; weightCategoryId: string | null };
const MAX_EVENTS = 4;

export function SportsStep() {
  const { draft, setDraft } = useWizard();
  const gender = draft.identity.gender;
  const age = draft.identity.dob ? ageOn(draft.identity.dob, draft.ageCutoffDate) : null;
  const { values, set, validate, errors } = useSection("sports", {
    registrations: draft.sports.registrations as Reg[],
    playingPosition: draft.sports.playingPosition ?? "",
  });

  // Sports open to this athlete (at least one event matching their verified gender and age).
  const catalog = useMemo(
    () =>
      draft.catalog
        .map((s) => ({
          ...s,
          events: s.events.filter((e) => (e.gender === "MIXED" || e.gender === gender) && (e.ageLimit?.maxAge == null || age === null || age < e.ageLimit.maxAge)),
          weightCategories: s.weightCategories.filter((w) => w.gender === gender),
        }))
        .filter((s) => s.events.length > 0),
    [draft.catalog, gender, age],
  );
  const sportOfEvent = (id: string) => catalog.find((s) => s.events.some((e) => e.id === id));

  const [chosenSports, setChosenSports] = useState<string[]>(() => [...new Set(values.registrations.map((r) => sportOfEvent(r.eventId)?.id).filter((x): x is string => !!x))]);
  const regs = values.registrations;
  const full = regs.length >= MAX_EVENTS;

  function toggleSport(id: string) {
    if (chosenSports.includes(id)) {
      setChosenSports(chosenSports.filter((s) => s !== id));
      const sport = catalog.find((s) => s.id === id);
      set("registrations", regs.filter((r) => !sport?.events.some((e) => e.id === r.eventId)));
    } else {
      setChosenSports([...chosenSports, id]);
    }
  }

  function toggleEvent(eventId: string) {
    if (regs.some((r) => r.eventId === eventId)) set("registrations", regs.filter((r) => r.eventId !== eventId));
    else if (!full) set("registrations", [...regs, { eventId, weightCategoryId: null }]);
  }

  function setWeight(eventId: string, weightCategoryId: string) {
    set("registrations", regs.map((r) => (r.eventId === eventId ? { ...r, weightCategoryId: weightCategoryId || null } : r)));
  }

  const positions = [...new Set(chosenSports.flatMap((id) => catalog.find((s) => s.id === id)?.positions ?? []))];

  useStepValidator(() => {
    const extra: Record<string, string> = {};
    regs.forEach((r) => {
      const sport = sportOfEvent(r.eventId);
      if (sport?.isWeightCategory && !r.weightCategoryId) extra[`weight-${r.eventId}`] = "Choose your weight category";
    });
    return validate(sportsSchema, extra, { ...values, playingPosition: values.playingPosition || undefined });
  });

  return (
    <div className="space-y-6">
      <Alert tone="info" icon={<Info className="size-5" aria-hidden />} title={`Your age category: ${draft.ageCategory ?? "—"}`}>
        Calculated automatically from your verified date of birth (age on {formatDob(draft.ageCutoffDate)}). You can&apos;t choose it.
      </Alert>

      <Card>
        <CardHeader title="1. Choose your sports" description="Only sports with events open to you are shown." />
        <CardBody>
          {chosenSports.length === 0 && (
            <div className="mb-3">
              <FieldError id="registrations" message={errors.registrations} />
            </div>
          )}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Sports">
            {catalog.map((s) => {
              const on = chosenSports.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSport(s.id)}
                  className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 font-medium", on ? "border-primary bg-primary text-primary-fg" : "border-border-strong bg-surface text-fg hover:bg-surface-2")}
                >
                  {on && <Check className="size-4" aria-hidden />}
                  {s.name}
                  {s.isWeightCategory && <Scale className="size-3.5 opacity-70" aria-label="weight categories" />}
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {chosenSports.length > 0 && (
        <Card>
          <CardHeader title="2. Choose events" description={`Pick up to ${MAX_EVENTS} events in total · ${regs.length}/${MAX_EVENTS} selected`} />
          <CardBody className="space-y-6">
            {chosenSports.length > 0 && <FieldError id="registrations" message={errors.registrations} />}
            {chosenSports.map((sid) => {
              const sport = catalog.find((s) => s.id === sid);
              if (!sport) return null;
              return (
                <fieldset key={sid} className="space-y-2">
                  <legend className="font-heading text-xl font-semibold">{sport.name}</legend>
                  {sport.events.map((e) => {
                    const reg = regs.find((r) => r.eventId === e.id);
                    const checked = !!reg;
                    const wErr = errors[`weight-${e.id}`];
                    return (
                      <div key={e.id} className={cn("rounded-xl border p-3", checked ? "border-primary bg-surface-2" : "border-border")}>
                        <label className="flex min-h-11 cursor-pointer items-start gap-3">
                          <input type="checkbox" checked={checked} disabled={!checked && (full || !!e.closedReason)} onChange={() => toggleEvent(e.id)} className="mt-1 size-5 shrink-0 accent-[var(--primary)]" />
                          <span className="min-w-0">
                            <span className="block font-medium">{e.name}</span>
                            {e.closedReason && <span className="block text-small font-semibold text-warning-fg">{e.closedReason}</span>}
                            <span className="flex flex-wrap gap-x-3 text-small text-muted">
                              {e.eventDate && (
                                <span className="inline-flex items-center gap-1">
                                  <CalendarDays className="size-3.5" aria-hidden />
                                  {formatDob(e.eventDate)}
                                </span>
                              )}
                              {e.venue && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="size-3.5" aria-hidden />
                                  {e.venue}
                                </span>
                              )}
                            </span>
                          </span>
                        </label>
                        {checked && sport.isWeightCategory && (
                          <div className="mt-2 pl-8">
                            <Field id={`weight-${e.id}`} label="Weight category" error={wErr} hint="Your weight is measured by an official at the event-day weigh-in." required>
                              <Select {...fieldA11y(`weight-${e.id}`, wErr, true)} value={reg.weightCategoryId ?? ""} onChange={(ev) => setWeight(e.id, ev.target.value)}>
                                <option value="">Choose…</option>
                                {sport.weightCategories.map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.name}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </fieldset>
              );
            })}
            {full && <p className="text-small text-muted">You&apos;ve reached the maximum of {MAX_EVENTS} events. Untick one to choose another.</p>}
          </CardBody>
        </Card>
      )}

      {positions.length > 0 && (
        <Card>
          <CardHeader title="3. Playing position" />
          <CardBody>
            <Field id="playingPosition" label="Playing position (team sports)" hint="Optional — pick from the list or type your own">
              <Input {...fieldA11y("playingPosition", undefined, true)} list="positions" value={values.playingPosition} onChange={(e) => set("playingPosition", e.target.value)} />
              <datalist id="positions">
                {positions.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
          </CardBody>
        </Card>
      )}

      <DocumentUpload
        type="ACHIEVEMENT"
        label="Achievements"
        description="Certificates from past tournaments (up to 5). Helps coaches with team selection."
        multiple
        docs={draft.documents}
        onChange={(docs) => setDraft({ ...draft, documents: docs })}
      />
    </div>
  );
}
