"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CloudOff, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { WIZARD_STEPS } from "@/lib/constants";
import type { RegistrationDraft } from "@/lib/registration-types";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { WizardProvider, useWizard, type SaveState, type VerifyOptions } from "./wizard-context";
import { STEP_COMPONENTS } from "./steps";

export function Wizard({ initial, demo, verifyOptions }: { initial: RegistrationDraft; demo: boolean; verifyOptions: VerifyOptions }) {
  return (
    <WizardProvider initial={initial} demo={demo} verifyOptions={verifyOptions}>
      <WizardShell />
    </WizardProvider>
  );
}

function WizardShell() {
  const { draft, setDraft, saveState, flush, runValidator } = useWizard();
  const toast = useToast();
  const maxStep = WIZARD_STEPS.length - 1;
  const [step, setStep] = useState(() => Math.min(draft.identity.verified ? draft.wizardStep : 0, maxStep));
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const furthest = Math.max(draft.wizardStep, step);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Move focus to the new step heading for keyboard & screen-reader users.
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  async function go(to: number) {
    setBusy(true);
    const saved = await flush();
    setBusy(false);
    if (!saved) toast.error("Couldn't save your changes", "Check your connection — we'll keep trying.");
    setStep(to);
  }

  async function next() {
    setBusy(true);
    const valid = await runValidator();
    if (!valid) {
      setBusy(false);
      return;
    }
    await flush();
    const to = Math.min(step + 1, maxStep);
    if (to > draft.wizardStep) {
      const r = await api<{ draft: RegistrationDraft }>("/api/register/draft", { method: "PATCH", body: { step: to } });
      if (r.ok) setDraft(r.data.draft);
    }
    setBusy(false);
    setStep(to);
  }

  const Current = STEP_COMPONENTS[WIZARD_STEPS[step].id];
  const pct = Math.round(((step + 1) / WIZARD_STEPS.length) * 100);
  const isReview = step === maxStep;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-32 sm:px-6 sm:pt-10">
      {/* Progress */}
      <nav aria-label="Registration progress" className="mb-6">
        <div className="flex items-center justify-between gap-2 text-small">
          <p className="font-semibold text-fg">
            Step {step + 1} of {WIZARD_STEPS.length} · {WIZARD_STEPS[step].label}
          </p>
          <SaveIndicator state={saveState} />
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <ol className="mt-3 hidden gap-1 md:flex">
          {WIZARD_STEPS.map((s, i) => {
            const reachable = i <= furthest && (draft.identity.verified || i === 0);
            return (
              <li key={s.id} className="flex-1">
                <button
                  type="button"
                  disabled={!reachable || busy}
                  onClick={() => go(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={cn(
                    "flex min-h-11 w-full items-center justify-center gap-1 rounded-lg px-1 text-small font-medium",
                    i === step ? "bg-primary text-primary-fg" : reachable ? "text-fg hover:bg-surface-2" : "text-muted",
                  )}
                >
                  {i < furthest && i !== step && <Check className="size-3.5" aria-hidden />}
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <h1 ref={headingRef} tabIndex={-1} className="mb-6 text-[clamp(1.75rem,4vw,2.5rem)] text-fg focus:outline-none">
        {WIZARD_STEPS[step].label}
      </h1>

      <Current onGoTo={(i: number) => go(i)} />

      {/* Sticky Back / Next */}
      {!isReview && (
        <div data-fixed-bar className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Button variant="outline" onClick={() => go(step - 1)} disabled={step === 0 || busy} icon={<ArrowLeft className="size-4" aria-hidden />}>
              Back
            </Button>
            <Button onClick={next} loading={busy} disabled={step === 0 && !draft.identity.verified}>
              Save & continue <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted" role="status" aria-live="polite">
      {state === "saving" && (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden /> Saving…
        </>
      )}
      {state === "saved" && (
        <>
          <Save className="size-4" aria-hidden /> Draft saved
        </>
      )}
      {state === "error" && (
        <span className="inline-flex items-center gap-1.5 text-danger-fg">
          <CloudOff className="size-4" aria-hidden /> Not saved — retrying
        </span>
      )}
    </span>
  );
}
