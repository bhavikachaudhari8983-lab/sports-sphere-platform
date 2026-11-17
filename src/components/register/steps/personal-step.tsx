"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, LockedValue, Select, Textarea, fieldA11y } from "@/components/ui/field";
import { BLOOD_GROUPS, DOB_SOURCE_LABEL, GENDER_LABEL, type DobSource, type Gender } from "@/lib/constants";
import { personalSchema } from "@/lib/validation/registration";
import { formatDob } from "@/lib/utils";
import { useStepValidator, useWizard } from "../wizard-context";
import { useSection } from "../use-section";
import { DocumentUpload } from "../document-upload";

export function PersonalStep() {
  const { draft, setDraft } = useWizard();
  const p = draft.personal;
  const id = draft.identity;
  const verifiedVia = DOB_SOURCE_LABEL[id.dobSource as DobSource] ?? "DigiLocker";
  const { values, set, validate, errorFor } = useSection("personal", {
    mobile: p.mobile ?? "",
    email: p.email ?? "",
    address: p.address ?? "",
    bloodGroup: p.bloodGroup ?? "",
    emergencyName: p.emergencyName ?? "",
    emergencyPhone: p.emergencyPhone ?? "",
  });
  const [photoError, setPhotoError] = useState<string>();

  useStepValidator(() => {
    const hasPhoto = draft.documents.some((d) => d.type === "PHOTO");
    setPhotoError(hasPhoto ? undefined : "Upload a passport-size photo");
    return validate(personalSchema) && hasPhoto;
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Verified details" description={`Fetched from ${verifiedVia}. These can't be edited.`} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <LockedValue label="Full name" value={id.fullName} source={verifiedVia} />
          <LockedValue label="Date of birth" value={formatDob(id.dob)} source={verifiedVia} />
          <LockedValue label="Gender" value={id.gender ? GENDER_LABEL[id.gender as Gender] ?? id.gender : "—"} source={verifiedVia} />
          <LockedValue label="Age category" value={<span className="font-mono">{draft.ageCategory ?? "—"}</span>} source="Auto" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Contact" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {p.mobileVerified ? (
            <LockedValue label="Mobile" value={<span className="font-mono">{p.mobile}</span>} source="Verified" />
          ) : (
            <Field id="mobile" label="Mobile number" error={errorFor("mobile")} hint="With country code, e.g. +91 98xxxxxxxx" required>
              <Input {...fieldA11y("mobile", errorFor("mobile"), true)} type="tel" inputMode="tel" autoComplete="tel" value={values.mobile} onChange={(e) => set("mobile", e.target.value)} />
            </Field>
          )}
          {p.emailVerified ? (
            <LockedValue label="Email" value={<span className="break-all">{p.email}</span>} source="Verified" />
          ) : (
            <Field id="email" label="Email" error={errorFor("email")} required>
              <Input {...fieldA11y("email", errorFor("email"))} type="email" inputMode="email" autoComplete="email" value={values.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
          )}
          <Field id="address" label="Current address" error={errorFor("address")} required className="sm:col-span-2">
            <Textarea {...fieldA11y("address", errorFor("address"))} autoComplete="street-address" rows={3} value={values.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field id="bloodGroup" label="Blood group" error={errorFor("bloodGroup")} required>
            <Select {...fieldA11y("bloodGroup", errorFor("bloodGroup"))} value={values.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)}>
              <option value="">Choose…</option>
              {BLOOD_GROUPS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Emergency contact" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field id="emergencyName" label="Contact name" error={errorFor("emergencyName")} required>
            <Input {...fieldA11y("emergencyName", errorFor("emergencyName"))} autoComplete="off" value={values.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} />
          </Field>
          <Field id="emergencyPhone" label="Contact phone" error={errorFor("emergencyPhone")} hint="With country code" required>
            <Input {...fieldA11y("emergencyPhone", errorFor("emergencyPhone"), true)} type="tel" inputMode="tel" autoComplete="off" value={values.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <DocumentUpload
        type="PHOTO"
        label="Passport-size photo"
        description="Plain light background, face clearly visible. Printed on your Sports ID card."
        required
        imageOnly
        docs={draft.documents}
        onChange={(docs) => {
          setDraft({ ...draft, documents: docs });
          setPhotoError(undefined);
        }}
        error={photoError}
      />
    </div>
  );
}
