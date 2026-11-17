"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, fieldA11y } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client-api";

export type VenueRow = { id: string; name: string; address: string | null; courts: Array<{ id: string; name: string; active: boolean; upcoming: number }> };

function useOp() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(body: Record<string, unknown>, success: string, key: string) {
    setBusy(key);
    const r = await api("/api/admin/venues", { body });
    setBusy(null);
    if (!r.ok) {
      toast.error("Not saved", r.error);
      return r.fieldErrors;
    }
    toast.success(success);
    router.refresh();
    return null;
  }
  return { run, busy };
}

function AddCourt({ venueId }: { venueId: string }) {
  const { run, busy } = useOp();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const errs = await run({ op: "court-add", venueId, name }, "Court added", `court-${venueId}`);
        if (errs) setError(errs.name);
        else setName("");
      }}
    >
      <Field id={`court-${venueId}`} label="Add a court, field, pool or hall" error={error} className="min-w-56 flex-1">
        <Input {...fieldA11y(`court-${venueId}`, error)} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Basketball Court 1" />
      </Field>
      <Button type="submit" variant="outline" loading={busy === `court-${venueId}`} icon={<Plus className="size-4" aria-hidden />}>
        Add court
      </Button>
    </form>
  );
}

export function VenuesPanel({ venues }: { venues: VenueRow[] }) {
  const { run, busy } = useOp();
  const [v, setV] = useState({ name: "", address: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <div className="space-y-6">
      {venues.length === 0 && <p className="rounded-lg border border-dashed border-border-strong bg-surface p-6 text-center text-muted">No venues yet. Add the first one below, then its courts. Matches can then be scheduled onto courts.</p>}
      {venues.map((ven) => (
        <Card key={ven.id}>
          <CardHeader title={ven.name} description={ven.address ?? undefined} />
          <CardBody className="space-y-4">
            {ven.courts.length === 0 ? (
              <p className="text-muted">No courts yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {ven.courts.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span className="flex items-center gap-2">
                      <MapPin className="size-4 text-muted" aria-hidden />
                      <span className="font-semibold">{c.name}</span>
                      {!c.active && <StatusPill status="CANCELLED" label="Closed" />}
                      <span className="text-small text-muted">
                        {c.upcoming} upcoming match{c.upcoming === 1 ? "" : "es"}
                      </span>
                    </span>
                    <Button size="sm" variant="ghost" loading={busy === `act-${c.id}`} onClick={() => run({ op: "court-active", courtId: c.id, active: !c.active }, c.active ? "Court closed" : "Court re-opened", `act-${c.id}`)}>
                      {c.active ? "Close court" : "Re-open court"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <AddCourt venueId={ven.id} />
          </CardBody>
        </Card>
      ))}
      <Card>
        <CardHeader title="Add a venue" description="A place where matches are played. Add its courts after creating it." />
        <CardBody>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const errs = await run({ op: "venue-create", name: v.name, address: v.address || null }, "Venue added", "venue");
              setErrors(errs ?? {});
              if (!errs) setV({ name: "", address: "" });
            }}
          >
            <Field id="venue-name" label="Venue name" error={errors.name} required>
              <Input {...fieldA11y("venue-name", errors.name)} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Dronacharya Sports Complex" />
            </Field>
            <Field id="venue-address" label="Address or directions" error={errors.address}>
              <Input {...fieldA11y("venue-address", errors.address)} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" loading={busy === "venue"} icon={<Plus className="size-4" aria-hidden />}>
                Add venue
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
