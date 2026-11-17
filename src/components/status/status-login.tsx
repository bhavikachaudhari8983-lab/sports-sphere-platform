"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, fieldA11y } from "@/components/ui/field";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { OtpEntry } from "@/components/register/otp-entry";
import { Alert } from "@/components/ui/badge";
import { OrDivider, UniversitySsoButton, type SsoInfo } from "@/components/register/university-sso-button";

type Sent = { challengeId: string; maskedTarget: string; demoCode?: string };

type Mode = "SMS" | "EMAIL" | "PRN";
const MODE_LABEL: Record<Mode, string> = { SMS: "Mobile", EMAIL: "Email", PRN: "PRN" };

export function StatusLogin({ demo, notice, sso, ssoError }: { demo: boolean; notice?: ReactNode; sso?: SsoInfo | null; ssoError?: string | null }) {
  const [channel, setChannel] = useState<Mode>("SMS");
  const [prnChannel, setPrnChannel] = useState<"SMS" | "EMAIL">("SMS");
  const [value, setValue] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(undefined);
    const v = channel === "SMS" && /^\d{10}$/.test(value) ? `+91${value}` : value;
    const body =
      channel === "PRN" ? { path: "LOGIN_PRN", prn: value, channel: prnChannel } : channel === "SMS" ? { path: "LOGIN", channel, mobile: v } : { path: "LOGIN", channel, email: v };
    const r = await api<Sent>("/api/otp/send", { body });
    setLoading(false);
    if (!r.ok) return setError(r.fieldErrors.prn ?? r.fieldErrors.mobile ?? r.fieldErrors.email ?? r.error);
    setSent(r.data);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:py-16">
      {notice}
      <h1 className="text-fg">Check your status</h1>
      <p className="mt-2 text-muted">Sign in with your PRN (host-university students), or the mobile number or email you verified during registration.</p>
      {ssoError && (
        <Alert tone="danger" title="Sign-in didn't work" className="mt-4">
          {ssoError}
        </Alert>
      )}
      <Card className="mt-6">
        <CardBody>
          {sent ? (
            <OtpEntry {...sent} onResend={() => send()} onBack={() => setSent(null)} />
          ) : (
            <div className="space-y-5">
            {sso && (
              <>
                <UniversitySsoButton sso={sso} callbackUrl="/status" />
                <OrDivider />
              </>
            )}
            <form onSubmit={send} className="space-y-5" noValidate>
              <div role="radiogroup" aria-label="Sign in with" className="inline-flex rounded-lg border border-border-strong p-1">
                {(["PRN", "SMS", "EMAIL"] as const).map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={channel === c} onClick={() => { setChannel(c); setValue(""); setError(undefined); }} className={cn("min-h-11 rounded-md px-4 font-medium", channel === c ? "bg-primary text-primary-fg" : "text-muted")}>
                    {MODE_LABEL[c]}
                  </button>
                ))}
              </div>
              {channel === "PRN" ? (
                <>
                  <Field id="login-prn" label="PRN / enrollment number" error={error} hint="As printed on your university ID card" required>
                    <Input {...fieldA11y("login-prn", error, true)} value={value} onChange={(e) => setValue(e.target.value.trim().toUpperCase())} autoCapitalize="characters" autoComplete="username" spellCheck={false} className="font-mono uppercase" />
                  </Field>
                  <fieldset>
                    <legend className="text-small font-semibold text-fg">Send the code to the contact in your university records</legend>
                    <div className="mt-2 flex gap-4">
                      {(["SMS", "EMAIL"] as const).map((c) => (
                        <label key={c} className="flex min-h-11 items-center gap-2">
                          <input type="radio" name="prn-channel" checked={prnChannel === c} onChange={() => setPrnChannel(c)} className="size-4 accent-[var(--primary)]" />
                          {c === "SMS" ? "Mobile (SMS)" : "University email"}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </>
              ) : channel === "SMS" ? (
                <Field id="login-mobile" label="Mobile number" error={error} hint="10-digit Indian number, or include the country code (+…)" required>
                  <Input {...fieldA11y("login-mobile", error, true)} type="tel" inputMode="tel" autoComplete="tel" value={value} onChange={(e) => setValue(e.target.value.trim())} className="font-mono" />
                </Field>
              ) : (
                <Field id="login-email" label="Email address" error={error} required>
                  <Input {...fieldA11y("login-email", error)} type="email" inputMode="email" autoComplete="email" value={value} onChange={(e) => setValue(e.target.value)} />
                </Field>
              )}
              <Button type="submit" loading={loading} icon={<LogIn className="size-4" aria-hidden />}>
                Send code
              </Button>
              {demo && (
                <p className="rounded-lg border-2 border-dashed border-info/50 p-3 text-small">
                  <strong className="text-info-fg">Demo:</strong> approved student Aarav Kulkarni → mobile <span className="font-mono">7000010001</span> (or PRN tab → <span className="font-mono">SS23CS001</span>). Flagged student Rohan → <span className="font-mono">7000010002</span>. Outside student awaiting college confirmation → <span className="font-mono">7000020001</span>.
                </p>
              )}
            </form>
            </div>
          )}
        </CardBody>
      </Card>
      <p className="mt-6 text-center text-muted">
        Not registered yet?{" "}
        <Link href="/register" className="font-semibold text-fg underline underline-offset-4">
          Start registration
        </Link>
      </p>
    </div>
  );
}
