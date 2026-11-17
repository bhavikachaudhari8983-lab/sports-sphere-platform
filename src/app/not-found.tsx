import Link from "next/link";
import { Compass } from "lucide-react";
import { Logo } from "@/components/layout/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-surface px-4 shadow-card">
        <div className="mx-auto flex h-20 max-w-7xl items-center">
          <Logo />
        </div>
      </header>
      <div aria-hidden className="brand-stripe" />
      <main id="main" className="grid flex-1 place-items-center px-4 py-16">
        <div className="max-w-md text-center">
          <p className="font-mono text-6xl font-semibold text-muted">404</p>
          <span className="mx-auto mt-4 grid size-14 place-items-center rounded-full bg-surface-2 text-muted">
            <Compass className="size-7" aria-hidden />
          </span>
          <h1 className="mt-4 text-[clamp(1.75rem,4vw,2.5rem)] text-fg">Out of bounds</h1>
          <p className="mt-2 text-muted">We couldn&apos;t find that page. It may have moved, or the link may be wrong.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-semibold text-accent-fg hover:bg-accent-hover">
              Go home
            </Link>
            <Link href="/status" className="inline-flex min-h-11 items-center rounded-lg border border-border-strong px-4 font-semibold hover:bg-surface-2">
              Check status
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
