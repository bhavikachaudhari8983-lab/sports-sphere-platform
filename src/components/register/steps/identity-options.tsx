"use client";

// The two alternatives to DigiLocker. Every Indian student, from the host university or any other, gets the same
// options and the same rules: a Government-verified identity (DigiLocker / Aadhaar Offline e-KYC), or a typed identity
// with a Government ID that an official checks at the desk before the registration can be verified.
import { useState } from "react";
import { FileArchive, IdCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, fieldA11y } from "@/components/ui/field";
import { GENDER_LABEL, GENDERS, ID_DOC_LABEL, ID_DOC_TYPES, type Gender, type IdDocType } from "@/lib/constants";
import type { RegistrationDraft, DraftCheck } from "@/lib/registration-types";
import { api } from "@/lib/client-api";
import { DocumentUpload } from "../document-upload";
import { useWizard } from "../wizard-context";

type Done = (draft: RegistrationDraft, mismatches: DraftCheck[]) => void;

/** Aadhaar Offline e-KYC: upload the ZIP from UIDAI + the share code the student set there. */
export function OfflineEkycForm({ onDone }: { onDone: Done }) {
  const { demo } = useWizard();
  const [file, setFile] = useState<File | null>(null);
  const [shareCode, setShareCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!file) fe.file = "Choose the ZIP file you downloaded";
    if (shareCode.trim().length < 4) fe.shareCode = "Enter your share code";
    setErrors(fe);
    setError(undefined);
    if (Object.keys(fe).length || !file) return;
    setBusy(true);
    const form = new FormData();
    form.set("file", file);
    form.set("shareCode", shareCode.trim());
    try {
      const res = await fetch("/api/register/aadhaar-offline", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { error?: string; fieldErrors?: Record<string, string>; draft?: RegistrationDraft; mismatches?: DraftCheck[] };
      if (!res.ok || !json.draft) {
        setErrors(json.fieldErrors ?? {});
        setError(json.error ?? "Verification didn't work. Please try again.");
        return;
      }
      onDone(json.draft, json.mismatches ?? []);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <ol className="list-inside list-decimal space-y-1 text-small text-muted">
        <li>
          On UIDAI&apos;s <strong className="text-fg">myAadhaar</strong> website, choose <strong className="text-fg">Offline eKYC</strong>.
        </li>
        <li>Sign in with your Aadhaar number and the code sent to your Aadhaar-linked mobile.</li>
        <li>Set a share code (a password for the file) and download the ZIP file.</li>
        <li>Upload that ZIP file here, unchanged, with the same share code.</li>
      </ol>
      <Field id="ekyc-file" label="Offline e-KYC ZIP file" error={errors.file} required>
        <Input
          {...fieldA11y("ekyc-file", errors.file)}
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5"
        />
      </Field>
      <Field id="ekyc-code" label="Share code" error={errors.shareCode} hint="The password you set when downloading the file. We use it only to open the file." required>
        <Input {...fieldA11y("ekyc-code", errors.shareCode, true)} value={shareCode} onChange={(e) => setShareCode(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" />
      </Field>
      {error && (
        <p role="alert" className="text-small font-semibold text-danger-fg">
          {error}
        </p>
      )}
      <Button type="submit" loading={busy} icon={<FileArchive className="size-4" aria-hidden />}>
        Verify file
      </Button>
      {demo && (
        <p className="rounded-lg border-2 border-dashed border-info/50 p-3 text-small">
          <strong className="text-info-fg">Demo:</strong> upload any .zip file. Share code <span className="font-mono">10000005</span> gives Vikram (date of birth differs from the university record), <span className="font-mono">20000002</span> gives Pooja (other university).
        </p>
      )}
    </form>
  );
}

/** Manual route: typed details + a photo of a Government ID. Checked against the original at the desk. */
export function ManualIdentityForm({ onDone }: { onDone: Done }) {
  const { draft, setDraft } = useWizard();
  const [v, setV] = useState({ fullName: "", dob: "", gender: "" as Gender | "", aadhaarLast4: "", idDocType: "" as IdDocType | "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!draft.documents.some((d) => d.type === "ID_PROOF")) {
      setErrors({ ID_PROOF: "Upload a photo of your ID first" });
      return;
    }
    setBusy(true);
    const r = await api<{ draft: RegistrationDraft; mismatches: DraftCheck[] }>("/api/register/identity-manual", { body: v });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors);
      setError(r.error);
      return;
    }
    setErrors({});
    onDone(r.data.draft, r.data.mismatches);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-small text-muted">
        Enter your details exactly as printed on a Government photo ID and upload a clear photo of it. Bring the <strong className="text-fg">original ID</strong> to the verification desk: an official checks it
        before your registration can be approved. Your details are saved but not verified until then.
      </p>
      <Field id="id-type" label="ID you are uploading" error={errors.idDocType} required>
        <Select {...fieldA11y("id-type", errors.idDocType)} value={v.idDocType} onChange={set("idDocType")}>
          <option value="">Choose…</option>
          {ID_DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {ID_DOC_LABEL[t]}
            </option>
          ))}
        </Select>
      </Field>
      <DocumentUpload type="ID_PROOF" label="Photo of the ID (front side)" description="JPG, PNG or PDF. Name, photo and date of birth must be readable." required docs={draft.documents} onChange={(docs) => setDraft({ ...draft, documents: docs })} error={errors.ID_PROOF} />
      <Field id="id-name" label="Full name (as on the ID)" error={errors.fullName} required>
        <Input {...fieldA11y("id-name", errors.fullName)} value={v.fullName} onChange={set("fullName")} autoComplete="name" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="id-dob" label="Date of birth (as on the ID)" error={errors.dob} required>
          <Input {...fieldA11y("id-dob", errors.dob)} type="date" value={v.dob} onChange={set("dob")} />
        </Field>
        <Field id="id-gender" label="Gender" error={errors.gender} required>
          <Select {...fieldA11y("id-gender", errors.gender)} value={v.gender} onChange={set("gender")}>
            <option value="">Choose…</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {GENDER_LABEL[g]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="id-aadhaar4" label="Last 4 digits of your Aadhaar number" error={errors.aadhaarLast4} hint="Used only to make sure one person has one profile. We never ask for the full number." required>
        <Input {...fieldA11y("id-aadhaar4", errors.aadhaarLast4, true)} value={v.aadhaarLast4} onChange={(e) => setV({ ...v, aadhaarLast4: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" className="w-32 font-mono" />
      </Field>
      {error && (
        <p role="alert" className="text-small font-semibold text-danger-fg">
          {error}
        </p>
      )}
      <Button type="submit" loading={busy} icon={<IdCard className="size-4" aria-hidden />}>
        Save details
      </Button>
      <p className="text-small text-muted">After saving, your date of birth can only be corrected by the sports office.</p>
    </form>
  );
}
