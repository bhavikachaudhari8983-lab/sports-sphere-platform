"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, ChevronRight, Globe2, GraduationCap, Mail, Smartphone } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, fieldA11y } from "@/components/ui/field";
import { Alert } from "@/components/ui/badge";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { OtpEntry } from "./otp-entry";
import { DemoPanel, useDemoHints } from "./demo-panel";
import { OrDivider, UniversitySsoButton, type SsoInfo } from "./university-sso-button";

type Path = "A" | "B" | "C";
type Sent = { challengeId: string; maskedTarget: string; demoCode?: string };

const PATHS: Array<{ id: Path; title: string; desc: string; icon: typeof GraduationCap; needs: string }> = [
  { id: "A", title: "Host university student (Indian)", desc: "I study at the university hosting the games.", icon: GraduationCap, needs: "PRN, DigiLocker, live selfie" },
  { id: "B", title: "Other university (Indian)", desc: "I study at another college or university in India.", icon: Building2, needs: "Mobile, DigiLocker, college ID + bonafide letter" },
  { id: "C", title: "International / OCI / NRI", desc: "I hold a foreign passport or have no Aadhaar.", icon: Globe2, needs: "Passport, visa, FRRO permit" },
];

export function StartRegistration({ demo, sso }: { demo: boolean; sso?: SsoInfo | null }) {
  const [path, setPath] = useState<Path | null>(null);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-fg">Register for sports</h1>
      <p className="mt-2 text-muted">Takes about 10 minutes. Your progress is saved automatically — you can come back any time.</p>

      {!path ? (
        <fieldset className="mt-8">
          <legend className="mb-4 font-heading text-2xl font-semibold">Who are you?</legend>
          <div className="grid gap-4">
            {PATHS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPath(p.id)}
                className="group flex w-full items-center gap-4 rounded-xl border border-border bg-surface p-4 text-left shadow-card transition-colors hover:border-primary sm:p-5"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-tint text-tint-fg">
                  <p.icon className="size-6" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-xl font-semibold text-fg">{p.title}</span>
                  <span className="block text-muted">{p.desc}</span>
                  <span className="mt-1 block text-small text-muted">You&apos;ll need: {p.needs}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted group-hover:text-fg" aria-hidden />
              </button>
            ))}
          </div>
          <p className="mt-6 text-muted">
            Already started or registered?{" "}
            <Link href="/status" className="font-semibold text-fg underline underline-offset-4">
              Sign in to check your status
            </Link>
          </p>
        </fieldset>
      ) : (
        <Card className="mt-8">
          <CardBody className="space-y-6">
            <button type="button" onClick={() => setPath(null)} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-medium text-muted hover:text-fg">
              <ArrowLeft className="size-4" aria-hidden /> Choose a different option
            </button>
            {path === "A" && <PathA demo={demo} sso={sso} />}
            {path === "B" && <PathB demo={demo} />}
            {path === "C" && <PathC demo={demo} />}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function PathA({ demo, sso }: { demo: boolean; sso?: SsoInfo | null }) {
  const hints = useDemoHints(demo);
  const [prn, setPrn] = useState("");
  const [lookup, setLookup] = useState<{ prn: string; maskedPhone: string; maskedEmail: string } | null>(null);
  const [channel, setChannel] = useState<"SMS" | "EMAIL">("SMS");
  const [sent, setSent] = useState<Sent | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(undefined);
    const r = await api<{ prn: string; maskedPhone: string; maskedEmail: string }>("/api/register/lookup-prn", { body: { prn } });
    setLoading(false);
    if (!r.ok) return setError(r.fieldErrors.prn ?? r.error);
    setLookup(r.data);
  }

  async function send() {
    if (!lookup) return;
    setLoading(true);
    setError(undefined);
    const r = await api<Sent>("/api/otp/send", { body: { path: "A", prn: lookup.prn, channel } });
    setLoading(false);
    if (!r.ok) return setError(r.error);
    setSent(r.data);
  }

  if (sent) return <OtpEntry {...sent} onResend={send} onBack={() => setSent(null)} />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl">Step 1 of 2 · Find your university record</h2>
        <p className="text-muted">We&apos;ll send a code to the phone or email already on your university record.</p>
      </div>
      {!lookup && sso && (
        <>
          <UniversitySsoButton sso={sso} callbackUrl="/register" />
          <OrDivider />
        </>
      )}
      {!lookup ? (
        <form onSubmit={find} className="space-y-4" noValidate>
          <Field id="prn" label="PRN / enrollment number" error={error} hint="As printed on your university ID card, e.g. SS24CS006" required>
            <Input {...fieldA11y("prn", error, true)} value={prn} onChange={(e) => setPrn(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" spellCheck={false} className="font-mono uppercase" />
          </Field>
          <Button type="submit" loading={loading}>
            Find my record
          </Button>
        </form>
      ) : (
        <div className="space-y-4">
          <Alert tone="success" title={`Record found for ${lookup.prn}`}>
            Choose where to receive your one-time code.
          </Alert>
          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium">Send code to</legend>
            {(
              [
                { v: "SMS", label: "Phone (SMS)", target: lookup.maskedPhone, icon: Smartphone },
                { v: "EMAIL", label: "Email", target: lookup.maskedEmail, icon: Mail },
              ] as const
            ).map((o) => (
              <label key={o.v} className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3", channel === o.v ? "border-primary bg-surface-2" : "border-border")}>
                <input type="radio" name="channel" value={o.v} checked={channel === o.v} onChange={() => setChannel(o.v)} className="size-5 accent-[var(--primary)]" />
                <o.icon className="size-5 text-muted" aria-hidden />
                <span>
                  {o.label}: <span className="font-mono tabular">{o.target}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={send} loading={loading}>
              Send code
            </Button>
            <Button variant="ghost" onClick={() => setLookup(null)}>
              Use a different PRN
            </Button>
          </div>
        </div>
      )}
      {demo && hints && !lookup && (
        <DemoPanel title="Demo PRNs">
          <p>Tap a fictional ERP record to fill the PRN. Try an unknown PRN (e.g. SS99XX999) to see the “not registered” message.</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {hints.erp
              .filter((e) => !e.note?.startsWith("Seeded"))
              .map((e) => (
                <li key={e.prn}>
                  <button type="button" className="min-h-11 w-full rounded-lg px-2 text-left hover:bg-surface" onClick={() => setPrn(e.prn)}>
                    <span className="font-mono">{e.prn}</span> · {e.name}
                    {e.note && <span className="block text-muted">{e.note}</span>}
                  </button>
                </li>
              ))}
          </ul>
        </DemoPanel>
      )}
    </div>
  );
}

function PathB({ demo }: { demo: boolean }) {
  const hints = useDemoHints(demo);
  const [mobile, setMobile] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(undefined);
    const r = await api<Sent>("/api/otp/send", { body: { path: "B", mobile } });
    setLoading(false);
    if (!r.ok) return setError(r.fieldErrors.mobile ?? r.error);
    setSent(r.data);
  }

  if (sent) return <OtpEntry {...sent} onResend={() => send()} onBack={() => setSent(null)} />;
  return (
    <form onSubmit={send} className="space-y-5" noValidate>
      <div>
        <h2 className="text-2xl">Step 1 of 2 · Verify your mobile</h2>
        <p className="text-muted">Use the mobile number you&apos;ll use to sign in later.</p>
      </div>
      <Field id="mobile" label="Mobile number" error={error} hint="10-digit Indian mobile number" required>
        <div className="flex">
          <span className="inline-flex min-h-11 items-center rounded-l-lg border border-r-0 border-border-strong bg-surface-2 px-3 text-muted">+91</span>
          <Input {...fieldA11y("mobile", error, true)} type="tel" inputMode="numeric" autoComplete="tel-national" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/[^\d]/g, "").slice(0, 10))} className="rounded-l-none font-mono tabular" />
        </div>
      </Field>
      <Button type="submit" loading={loading}>
        Send code
      </Button>
      {demo && hints && (
        <DemoPanel>
          <p>Any 10-digit number starting 6–9 works in demo mode (the OTP is shown on screen). Fictional numbers used by outside-student DigiLocker accounts:</p>
          <ul>
            {hints.outside.map((o) => (
              <li key={o.aadhaar}>
                <button type="button" className="min-h-11 rounded-lg px-2 text-left hover:bg-surface" onClick={() => setMobile(o.mobile.slice(-10))}>
                  <span className="font-mono">{o.mobile.slice(-10)}</span> · {o.label}
                </button>
              </li>
            ))}
          </ul>
        </DemoPanel>
      )}
    </form>
  );
}

function PathC({ demo }: { demo: boolean }) {
  const [channel, setChannel] = useState<"EMAIL" | "SMS">("EMAIL");
  const [value, setValue] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(undefined);
    const body = channel === "EMAIL" ? { path: "C", channel, email: value } : { path: "C", channel, mobile: value };
    const r = await api<Sent>("/api/otp/send", { body });
    setLoading(false);
    if (!r.ok) return setError(r.fieldErrors.email ?? r.fieldErrors.mobile ?? r.error);
    setSent(r.data);
  }

  if (sent) return <OtpEntry {...sent} onResend={() => send()} onBack={() => setSent(null)} />;
  return (
    <form onSubmit={send} className="space-y-5" noValidate>
      <div>
        <h2 className="text-2xl">Step 1 of 2 · Verify your email or mobile</h2>
        <p className="text-muted">International, OCI and NRI students verify with a passport in the next step.</p>
      </div>
      <div role="radiogroup" aria-label="Verify with" className="inline-flex rounded-lg border border-border-strong p-1">
        {(["EMAIL", "SMS"] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={channel === c}
            onClick={() => {
              setChannel(c);
              setValue("");
              setError(undefined);
            }}
            className={cn("min-h-11 rounded-md px-4 font-medium", channel === c ? "bg-primary text-primary-fg" : "text-muted")}
          >
            {c === "EMAIL" ? "Email" : "Mobile"}
          </button>
        ))}
      </div>
      {channel === "EMAIL" ? (
        <Field id="email" label="Email address" error={error} required>
          <Input {...fieldA11y("email", error)} type="email" inputMode="email" autoComplete="email" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      ) : (
        <Field id="mobile" label="Mobile number with country code" error={error} hint="e.g. +9779812345678" required>
          <Input {...fieldA11y("mobile", error, true)} type="tel" inputMode="tel" autoComplete="tel" value={value} onChange={(e) => setValue(e.target.value)} className="font-mono tabular" />
        </Field>
      )}
      <Button type="submit" loading={loading}>
        Send code
      </Button>
      {demo && (
        <DemoPanel>
          <p>Any email address works in demo mode, e.g. <span className="font-mono">wanjiru@test.example</span>. The OTP is shown on screen.</p>
        </DemoPanel>
      )}
    </form>
  );
}
