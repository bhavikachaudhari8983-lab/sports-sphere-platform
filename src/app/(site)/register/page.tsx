import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac";
import { getDraftDto } from "@/lib/registration";
import { isDemoMode } from "@/lib/env";
import { StartRegistration } from "@/components/register/start-registration";
import { Wizard } from "@/components/register/wizard";
import { SessionNotice } from "@/components/status/session-notice";
import { ssoPrompt, universitySso } from "@/lib/university-sso";
import { verificationOptions } from "@/services";

export const metadata: Metadata = { title: "Register" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user?.role === "STUDENT") {
    const draft = await getDraftDto(user.id);
    if (draft) {
      if (draft.status !== "DRAFT") redirect("/status");
      return <Wizard initial={draft} demo={isDemoMode()} verifyOptions={verificationOptions()} />;
    }
  }
  return (
    <>
      {user && user.role !== "STUDENT" && (
        <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
          <SessionNotice user={user} wants="STUDENT" />
        </div>
      )}
      <StartRegistration demo={isDemoMode()} sso={(() => { const s = universitySso(); return s ? { ...ssoPrompt(s), universities: s.universities.map((u) => u.name) } : null; })()} />
    </>
  );
}
