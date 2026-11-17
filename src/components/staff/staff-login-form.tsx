"use client";

import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, fieldA11y } from "@/components/ui/field";
import { Alert } from "@/components/ui/badge";
import { staffLandingFor } from "@/lib/staff-home";

const DEMO = [
  { role: "Super admin", email: "admin@sportssphere.example", password: "Admin@12345" },
  { role: "Admin", email: "admin2@sportssphere.example", password: "Admin2@12345" },
  { role: "Official", email: "official@sportssphere.example", password: "Official@12345" },
  { role: "Medical", email: "medical@sportssphere.example", password: "Medical@12345" },
  { role: "Coach", email: "coach@sportssphere.example", password: "Coach@12345" },
];

export function StaffLoginForm({ callbackUrl, demo, initialError }: { callbackUrl?: string; demo: boolean; initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | undefined>(initialError);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return setError("Enter your email and password.");
    setLoading(true);
    setError(undefined);
    const res = await signIn("staff", { email, password, redirect: false });
    if (!res || res.error) {
      setLoading(false);
      setError(res?.error && res.error !== "CredentialsSignin" ? res.error : "Email or password is incorrect.");
      return;
    }
    const session = await getSession();
    // Back to the page they wanted if their role may open it; otherwise their own home page.
    router.push(staffLandingFor(session?.user.role ?? "", callbackUrl)); // staff pages are dynamic; a refresh() here can cancel the push
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field id="email" label="Email" required>
        <Input {...fieldA11y("email")} type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field id="password" label="Password" required>
        <div className="relative">
          <Input {...fieldA11y("password")} type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-12" />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-fg">
            {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </button>
        </div>
      </Field>
      <Button type="submit" loading={loading} className="w-full" icon={<LogIn className="size-4" aria-hidden />}>
        Sign in
      </Button>
      {demo && (
        <div className="rounded-xl border-2 border-dashed border-info/50 p-3 text-small">
          <p className="mb-2 font-semibold text-info-fg">Demo accounts (fictional) — tap to fill</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {DEMO.map((d) => (
              <li key={d.role}>
                <button
                  type="button"
                  className="min-h-11 w-full rounded-lg px-2 text-left hover:bg-surface-2"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(d.password);
                  }}
                >
                  <span className="font-semibold">{d.role}</span> <span className="block break-all text-muted">{d.email}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
