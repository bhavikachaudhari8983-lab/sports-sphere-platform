"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { RegistrationDraft } from "@/lib/registration-types";
import type { DraftSection } from "@/lib/validation/registration";
import { api } from "@/lib/client-api";

export type SaveState = "idle" | "saving" | "saved" | "error";
type Validator = () => boolean | Promise<boolean>;

/** Identity-verification routes offered to this student (only ones that can genuinely work). */
export type VerifyOptions = { digilocker: boolean; aadhaarOffline: boolean; manual: boolean };

type Ctx = {
  draft: RegistrationDraft;
  setDraft: (d: RegistrationDraft) => void;
  demo: boolean;
  verifyOptions: VerifyOptions;
  saveState: SaveState;
  /** Field errors returned by the server for values it could not save. */
  skipped: Record<string, string>;
  queueSave: (section: DraftSection, values: Record<string, unknown>) => void;
  flush: () => Promise<boolean>;
  setValidator: (fn: Validator | null) => void;
  runValidator: () => Promise<boolean>;
};

const WizardContext = createContext<Ctx | null>(null);

const DEBOUNCE_MS = 900;

export function WizardProvider({ initial, demo, verifyOptions, children }: { initial: RegistrationDraft; demo: boolean; verifyOptions: VerifyOptions; children: ReactNode }) {
  const [draft, setDraft] = useState(initial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [skipped, setSkipped] = useState<Record<string, string>>({});
  const pending = useRef<Map<DraftSection, Record<string, unknown>>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);
  const validator = useRef<Validator | null>(null);

  const send = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inflight.current) await inflight.current;
    if (pending.current.size === 0) return true;
    const batches = [...pending.current.entries()];
    pending.current.clear();
    setSaveState("saving");
    const p = (async () => {
      let allOk = true;
      for (const [section, values] of batches) {
        const r = await api<{ draft: RegistrationDraft; skipped: Record<string, string> }>("/api/register/draft", { method: "PATCH", body: { section, values } });
        if (r.ok) {
          setDraft(r.data.draft);
          setSkipped((prev) => {
            const next = { ...prev };
            for (const k of Object.keys(values)) delete next[k];
            return { ...next, ...r.data.skipped };
          });
        } else {
          allOk = false;
          // Put it back so the next attempt retries.
          pending.current.set(section, { ...values, ...(pending.current.get(section) ?? {}) });
        }
      }
      setSaveState(allOk ? "saved" : "error");
      return allOk;
    })();
    inflight.current = p;
    const res = await p;
    inflight.current = null;
    return res;
  }, []);

  const queueSave = useCallback(
    (section: DraftSection, values: Record<string, unknown>) => {
      pending.current.set(section, { ...(pending.current.get(section) ?? {}), ...values });
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void send(), DEBOUNCE_MS);
    },
    [send],
  );

  // Save before the tab closes / goes to background (common on mobile).
  useEffect(() => {
    const onHide = () => {
      if (pending.current.size === 0) return;
      for (const [section, values] of pending.current.entries()) {
        void fetch("/api/register/draft", { method: "PATCH", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section, values }) });
      }
      pending.current.clear();
    };
    const onVis = () => document.visibilityState === "hidden" && onHide();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const setValidator = useCallback((fn: Validator | null) => {
    validator.current = fn;
  }, []);
  const runValidator = useCallback(async () => (validator.current ? await validator.current() : true), []);

  return (
    <WizardContext.Provider value={{ draft, setDraft, demo, verifyOptions, saveState, skipped, queueSave, flush: send, setValidator, runValidator }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard(): Ctx {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used inside <WizardProvider>");
  return ctx;
}

/** Registers the current step's "can I continue?" check with the shell. */
export function useStepValidator(fn: Validator) {
  const { setValidator } = useWizard();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    setValidator(() => ref.current());
    return () => setValidator(null);
  }, [setValidator]);
}
