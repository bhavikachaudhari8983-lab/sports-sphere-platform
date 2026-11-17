"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, BookUser, Ruler, Scale } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, fieldA11y } from "@/components/ui/field";
import { Alert, Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client-api";
import { formatDateTime } from "@/lib/utils";

type WeighEvent = { eventId: string; label: string; category: string | null; latest: { weightKg: number; withinCategory: boolean | null; at: string; by: string } | null };

type Props = {
  studentId: string;
  name: string;
  status: string;
  isInternational: boolean;
  passportVerified: boolean;
  passportLabel: string | null;
  /** Manual identity route: details to compare with the original Government ID. null = not a manual identity. */
  idCheck: { verified: boolean; idLabel: string; name: string; dob: string; aadhaarLast4: string } | null;
  blockers: string[];
  latest: { heightCm: number; weightKg: number; at: string; by: string } | null;
  weighEvents: WeighEvent[];
};

export function DeskPanel(p: Props) {
  const router = useRouter();
  const toast = useToast();
  const [m, setM] = useState({ heightCm: "", weightKg: "" });
  const [mErr, setMErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [passportTick, setPassportTick] = useState(false);
  const [idTick, setIdTick] = useState(false);
  const [confirmVerify, setConfirmVerify] = useState(false);
  const [weigh, setWeigh] = useState<Record<string, string>>({});
  const [weighErr, setWeighErr] = useState<Record<string, string>>({});

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    const r = await api<{ withinCategory?: boolean | null; category?: string | null }>(`/api/desk/students/${p.studentId}`, { body });
    setBusy(null);
    return r;
  }

  async function saveMeasurement(e: React.FormEvent) {
    e.preventDefault();
    const r = await post({ op: "measurement", ...m }, "m");
    if (!r.ok) {
      setMErr(r.fieldErrors);
      if (!Object.keys(r.fieldErrors).length) toast.error("Not saved", r.error);
      return;
    }
    setMErr({});
    setM({ heightCm: "", weightKg: "" });
    toast.success("Measurement recorded", `${p.name}`);
    router.refresh();
  }

  const canVerify = p.blockers.length === 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Height & weight" description="Measured by you. Students can never enter or change these." />
        <CardBody className="space-y-4">
          {p.latest ? (
            <p className="flex flex-wrap items-center gap-2">
              <Ruler className="size-5 text-muted" aria-hidden />
              <span className="font-mono text-xl font-semibold tabular">
                {p.latest.heightCm} cm · {p.latest.weightKg} kg
              </span>
              <span className="text-small text-muted">
                by {p.latest.by}, {formatDateTime(p.latest.at)}
              </span>
            </p>
          ) : (
            <p className="text-muted">Not measured yet.</p>
          )}
          <form onSubmit={saveMeasurement} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" noValidate>
            <Field id="heightCm" label="Height (cm)" error={mErr.heightCm} required>
              <Input {...fieldA11y("heightCm", mErr.heightCm)} type="number" inputMode="decimal" step="0.1" min={100} max={250} value={m.heightCm} onChange={(e) => setM({ ...m, heightCm: e.target.value })} className="font-mono" />
            </Field>
            <Field id="weightKg" label="Weight (kg)" error={mErr.weightKg} required>
              <Input {...fieldA11y("weightKg", mErr.weightKg)} type="number" inputMode="decimal" step="0.1" min={25} max={250} value={m.weightKg} onChange={(e) => setM({ ...m, weightKg: e.target.value })} className="font-mono" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" loading={busy === "m"} className="w-full">
                {p.latest ? "Record new" : "Save"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {p.isInternational && (
        <Card>
          <CardHeader title="Passport check" description={p.passportLabel ?? undefined} />
          <CardBody className="space-y-3">
            {p.passportVerified ? (
              <p className="inline-flex items-center gap-2 font-semibold text-success-fg">
                <BadgeCheck className="size-5" aria-hidden /> Passport chip/MRZ verified
              </p>
            ) : (
              <>
                <p className="text-muted">Read the passport chip or MRZ with the desk reader and compare it with the original document.</p>
                <Checkbox id="passportTick" checked={passportTick} onChange={(e) => setPassportTick(e.target.checked)} label="Passport chip/MRZ verified — original document seen" />
                <Button
                  variant="secondary"
                  disabled={!passportTick}
                  loading={busy === "pp"}
                  icon={<BookUser className="size-4" aria-hidden />}
                  onClick={async () => {
                    const r = await post({ op: "passport", verified: true }, "pp");
                    if (!r.ok) return toast.error("Not saved", r.error);
                    toast.success("Passport marked as verified");
                    router.refresh();
                  }}
                >
                  Save passport check
                </Button>
              </>
            )}
          </CardBody>
        </Card>
      )}

      {p.idCheck && (
        <Card>
          <CardHeader title="Government ID check" description={`${p.idCheck.idLabel}, entered by the student`} />
          <CardBody className="space-y-3">
            {p.idCheck.verified ? (
              <p className="inline-flex items-center gap-2 font-semibold text-success-fg">
                <BadgeCheck className="size-5" aria-hidden /> Original ID checked
              </p>
            ) : (
              <>
                <p className="text-muted">Ask for the original ID. Check that the photo is this athlete, and that it shows exactly:</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-surface-2 p-3 text-small">
                  <dt className="text-muted">Name</dt>
                  <dd className="font-semibold">{p.idCheck.name}</dd>
                  <dt className="text-muted">Date of birth</dt>
                  <dd className="font-semibold">{p.idCheck.dob}</dd>
                  <dt className="text-muted">Aadhaar last 4</dt>
                  <dd className="font-mono font-semibold">XXXX XXXX {p.idCheck.aadhaarLast4}</dd>
                </dl>
                <p className="text-small text-muted">If anything differs, don&apos;t tick. Flag the registration for the sports office instead.</p>
                <Checkbox id="idTick" checked={idTick} onChange={(e) => setIdTick(e.target.checked)} label="Original ID seen, photo matches, and all details match" />
                <Button
                  variant="secondary"
                  disabled={!idTick}
                  loading={busy === "id"}
                  icon={<BookUser className="size-4" aria-hidden />}
                  onClick={async () => {
                    const r = await post({ op: "id-doc", verified: true }, "id");
                    if (!r.ok) return toast.error("Not saved", r.error);
                    toast.success("ID check saved");
                    router.refresh();
                  }}
                >
                  Save ID check
                </Button>
              </>
            )}
          </CardBody>
        </Card>
      )}

      {p.status === "PENDING" && (
        <Card>
          <CardHeader title="Complete verification" />
          <CardBody className="space-y-3">
            {!canVerify && (
              <Alert tone="warning" title="Before you can verify">
                <ul className="list-inside list-disc">
                  {p.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </Alert>
            )}
            <p className="text-small text-muted">Confirm the live selfie matches the verified photo and the person in front of you.</p>
            <Button variant="success" size="lg" disabled={!canVerify} onClick={() => setConfirmVerify(true)} icon={<BadgeCheck className="size-5" aria-hidden />}>
              Mark as verified
            </Button>
          </CardBody>
        </Card>
      )}

      {p.weighEvents.length > 0 && (
        <Card>
          <CardHeader title="Event-day weigh-ins" description="One record per weigh-in. The latest one counts." />
          <CardBody className="space-y-4">
            {p.status !== "VERIFIED" && p.status !== "APPROVED" && <Alert tone="info">Weigh-ins open once the athlete is verified.</Alert>}
            {p.weighEvents.map((ev) => (
              <div key={ev.eventId} className="rounded-xl border border-border p-3">
                <p className="font-semibold">
                  {ev.label} {ev.category && <Badge>{ev.category}</Badge>}
                </p>
                {ev.latest ? (
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-small">
                    <span className="font-mono text-base font-semibold">{ev.latest.weightKg} kg</span>
                    {ev.latest.withinCategory === false ? <Badge tone="danger">Outside category</Badge> : ev.latest.withinCategory ? <Badge tone="success">Within category</Badge> : null}
                    <span className="text-muted">
                      {ev.latest.by} · {formatDateTime(ev.latest.at)}
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 text-small text-muted">No weigh-in yet.</p>
                )}
                <form
                  className="mt-3 flex flex-wrap items-end gap-2"
                  noValidate
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await post({ op: "weigh-in", eventId: ev.eventId, weightKg: weigh[ev.eventId] ?? "" }, `w-${ev.eventId}`);
                    if (!r.ok) {
                      setWeighErr({ ...weighErr, [ev.eventId]: r.fieldErrors.weightKg ?? r.error });
                      return;
                    }
                    setWeighErr({ ...weighErr, [ev.eventId]: "" });
                    setWeigh({ ...weigh, [ev.eventId]: "" });
                    if (r.data.withinCategory === false) toast.error("Outside weight category", `${r.data.category ?? ""} — inform the event jury.`);
                    else toast.success("Weigh-in recorded");
                    router.refresh();
                  }}
                >
                  <Field id={`weigh-${ev.eventId}`} label="Weight (kg)" error={weighErr[ev.eventId] || undefined}>
                    <Input {...fieldA11y(`weigh-${ev.eventId}`, weighErr[ev.eventId] || undefined)} type="number" inputMode="decimal" step="0.1" value={weigh[ev.eventId] ?? ""} onChange={(e) => setWeigh({ ...weigh, [ev.eventId]: e.target.value })} className="w-36 font-mono" />
                  </Field>
                  <Button type="submit" variant="outline" loading={busy === `w-${ev.eventId}`} disabled={p.status !== "VERIFIED" && p.status !== "APPROVED"} icon={<Scale className="size-4" aria-hidden />}>
                    Record weigh-in
                  </Button>
                </form>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={confirmVerify}
        onClose={() => setConfirmVerify(false)}
        tone="success"
        confirmLabel="Mark verified"
        loading={busy === "v"}
        title={`Verify ${p.name}?`}
        description="You confirm the photo matches, measurements are recorded and documents were checked. An admin then approves and issues the QR Sports ID."
        onConfirm={async () => {
          const r = await post({ op: "verify" }, "v");
          setConfirmVerify(false);
          if (!r.ok) return toast.error("Not verified", r.error);
          toast.success("Marked as verified", "Sent to admin for approval.");
          router.refresh();
        }}
      />
    </div>
  );
}
