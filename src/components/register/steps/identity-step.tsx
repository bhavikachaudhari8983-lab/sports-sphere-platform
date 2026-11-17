"use client";

import { useState } from "react";
import { AlertTriangle, BadgeCheck, ChevronDown, Clock, FileArchive, IdCard, Lock, ShieldCheck } from "lucide-react";
import { Card, CardBody, DefinitionList } from "@/components/ui/card";
import { Alert } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CHECK_LABEL, DOB_SOURCE_LABEL, GENDER_LABEL, ID_DOC_LABEL, type CheckType, type DobSource, type Gender, type IdDocType } from "@/lib/constants";
import { formatDob } from "@/lib/utils";
import { useStepValidator, useWizard } from "../wizard-context";
import { DigiLockerDialog } from "../digilocker-dialog";
import { PassportForm } from "./passport-form";
import { DocumentUpload } from "../document-upload";
import { ManualIdentityForm, OfflineEkycForm } from "./identity-options";
import type { DraftCheck, RegistrationDraft } from "@/lib/registration-types";

export function IdentityStep() {
  const { draft, setDraft, demo, verifyOptions } = useWizard();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const onlyManual = !verifyOptions.digilocker && !verifyOptions.aadhaarOffline;
  const [expanded, setExpanded] = useState<"offline" | "manual" | null>(onlyManual ? "manual" : null);
  function done(d: RegistrationDraft, mismatches: DraftCheck[]) {
    setDraft(d);
    const manual = d.identity.dobSource === "MANUAL";
    if (mismatches.length) toast.toast({ tone: "warning", title: manual ? "Saved, but details don't match" : "Verified, but details don't match", description: "Your registration will be flagged for manual review." });
    else if (manual) toast.success("Details saved", "Bring the original ID to the verification desk.");
    else toast.success("Identity verified", "Your details were verified from a Government source.");
  }
  const [docErrors, setDocErrors] = useState<Record<string, string>>({});
  const intl = draft.studentType === "INTERNATIONAL";
  const v = draft.identity;

  useStepValidator(() => {
    if (!v.verified) return false;
    if (!intl) return true;
    const missing: Record<string, string> = {};
    for (const t of ["PASSPORT", "VISA", "FRRO"] as const) if (!draft.documents.some((d) => d.type === t)) missing[t] = "This document is required";
    setDocErrors(missing);
    return Object.keys(missing).length === 0;
  });

  if (!v.verified) {
    return intl ? (
      <PassportForm />
    ) : (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl">Verify your identity</h2>
          <p className="text-muted">Every Indian student, from this university or any other, verifies the same way. Choose one option.</p>
        </div>
        {verifyOptions.digilocker && (
          <Card>
            <CardBody className="space-y-4">
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-tint text-tint-fg">
                  <ShieldCheck className="size-6" aria-hidden />
                </span>
                <div>
                  <h3 className="text-xl">Verify with DigiLocker <span className="ml-1 rounded-full bg-tint px-2 py-0.5 align-middle text-small font-semibold text-tint-fg">Fastest</span></h3>
                  <p className="text-muted">Your name, date of birth and gender come directly from your Aadhaar record. You don&apos;t type them.</p>
                </div>
              </div>
              <ul className="list-inside list-disc space-y-1 text-small text-muted">
                <li>We receive only the last 4 digits of your Aadhaar.</li>
                <li>Your Class 10 certificate is fetched automatically. No upload needed.</li>
                <li>After verification your date of birth is locked.</li>
              </ul>
              <Button size="lg" onClick={() => setOpen(true)} icon={<ShieldCheck className="size-5" aria-hidden />}>
                Verify with DigiLocker
              </Button>
            </CardBody>
          </Card>
        )}
        {verifyOptions.aadhaarOffline && (
          <Option
            id="offline"
            icon={<FileArchive className="size-5" aria-hidden />}
            title="Aadhaar Offline e-KYC"
            subtitle="Upload the digitally signed file from UIDAI. Also verified instantly."
            open={expanded === "offline"}
            onToggle={() => setExpanded(expanded === "offline" ? null : "offline")}
          >
            <OfflineEkycForm onDone={done} />
          </Option>
        )}
        {verifyOptions.manual && (
          <Option
            id="manual"
            icon={<IdCard className="size-5" aria-hidden />}
            title={onlyManual ? "Enter your details with a Government ID" : "Can't use either? Use a Government ID"}
            subtitle="For example, if no mobile number is linked to your Aadhaar. An official checks the original ID at the desk."
            open={expanded === "manual"}
            onToggle={() => setExpanded(expanded === "manual" ? null : "manual")}
          >
            <ManualIdentityForm onDone={done} />
          </Option>
        )}
        {verifyOptions.digilocker && (
          <DigiLockerDialog
            open={open}
            demo={demo}
            prn={draft.studentType === "OUR_INDIAN" ? draft.academic.prn : null}
            onClose={() => setOpen(false)}
            onVerified={(d, mismatches) => {
              setOpen(false);
              done(d, mismatches);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <VerifiedIdentityCard />
      <ChecksSummary checks={draft.checks} />
      {intl && (
        <section className="space-y-3" aria-labelledby="intl-docs">
          <h2 id="intl-docs" className="text-xl">
            Immigration documents
          </h2>
          <p className="text-muted">These can&apos;t be fetched automatically, so please upload clear photos or PDFs.</p>
          <DocumentUpload type="PASSPORT" label="Passport photo page" required docs={draft.documents} onChange={(docs) => setDraft({ ...draft, documents: docs })} error={docErrors.PASSPORT} />
          <DocumentUpload type="VISA" label="Student visa" required docs={draft.documents} onChange={(docs) => setDraft({ ...draft, documents: docs })} error={docErrors.VISA} />
          <DocumentUpload type="FRRO" label="FRRO residence permit" description="Residential Permit issued by the FRRO/FRO" required docs={draft.documents} onChange={(docs) => setDraft({ ...draft, documents: docs })} error={docErrors.FRRO} />
        </section>
      )}
    </div>
  );
}

export function VerifiedIdentityCard() {
  const { draft } = useWizard();
  const v = draft.identity;
  const intl = draft.studentType === "INTERNATIONAL";
  const manual = v.dobSource === "MANUAL";
  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {manual ? <Clock className="size-6 text-warning-fg" aria-hidden /> : <BadgeCheck className="size-6 text-success-fg" aria-hidden />}
          <h2 className="text-2xl">{manual ? "Details saved: ID check at the desk" : "Identity verified"}</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-small text-muted">
            <Lock className="size-3.5" aria-hidden /> Locked
          </span>
        </div>
        {manual && (
          <p className="rounded-lg bg-warning-bg p-3 text-small text-warning-fg">
            Bring your original <strong>{v.identityDocType ? ID_DOC_LABEL[v.identityDocType as IdDocType] ?? "Government ID" : "Government ID"}</strong> to the verification desk. An official compares it with these details. Your registration can&apos;t be approved until this is done.
          </p>
        )}
        <DefinitionList
          items={[
            { label: "Full name", value: v.fullName },
            { label: "Date of birth", value: formatDob(v.dob) },
            { label: "Gender", value: v.gender ? GENDER_LABEL[v.gender as Gender] ?? v.gender : "—" },
            { label: "Age category", value: draft.ageCategory ? <span className="font-mono">{draft.ageCategory}</span> : "—" },
            intl ? { label: "Passport", value: <span className="font-mono">{v.nationality} · {v.passportNumber}</span> } : { label: "Aadhaar", value: <span className="font-mono">XXXX XXXX {v.aadhaarLast4}</span> },
            { label: manual ? "Verification" : "Verified via", value: DOB_SOURCE_LABEL[v.dobSource as DobSource] ?? "DigiLocker" },
          ]}
        />
        <p className="text-small text-muted">
          Age category is calculated from your verified date of birth as on {formatDob(draft.ageCutoffDate)}. If something is wrong, contact the sports office — only an admin can correct verified details.
        </p>
      </CardBody>
    </Card>
  );
}

/** One expandable option on the identity step. */
function Option({ id, icon, title, subtitle, open, onToggle, children }: { id: string; icon: React.ReactNode; title: string; subtitle: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <Card>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`opt-${id}`} className="flex w-full items-start gap-4 p-5 text-left">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg">{icon}</span>
        <span className="flex-1">
          <span className="block text-lg font-semibold text-fg">{title}</span>
          <span className="block text-small text-muted">{subtitle}</span>
        </span>
        <ChevronDown className={`mt-2 size-5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <CardBody id={`opt-${id}`} className="border-t border-border pt-5">
          {children}
        </CardBody>
      )}
    </Card>
  );
}

export function ChecksSummary({ checks }: { checks: DraftCheck[] }) {
  const failed = checks.filter((c) => !c.passed);
  if (!failed.length) return null;
  return (
    <Alert tone="warning" icon={<AlertTriangle className="size-5" aria-hidden />} title="Your details don't match our records">
      <ul className="mt-1 space-y-1">
        {failed.map((c) => (
          <li key={c.type}>
            <strong>{CHECK_LABEL[c.type as CheckType] ?? c.type}:</strong> record says “{c.type.includes("DOB") ? formatDob(c.expected) : c.expected}”, verified source says “{c.type.includes("DOB") ? formatDob(c.actual) : c.actual}”.
          </li>
        ))}
      </ul>
      <p className="mt-2">You can still complete the form. After you submit, your registration will be <strong>flagged</strong> for manual review by the sports office.</p>
    </Alert>
  );
}
