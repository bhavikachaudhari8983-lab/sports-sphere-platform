// Where each staff role starts, and which areas it may open. Plain module: usable on the server and in the browser.
// Keep in step with RULES in src/middleware.ts (the server re-checks every request anyway).

const HOME: Record<string, string> = { SUPER_ADMIN: "/admin", ADMIN: "/admin", OFFICIAL: "/desk", MEDICAL: "/medical", COACH: "/coach" };

const AREAS: Record<string, string[]> = {
  SUPER_ADMIN: ["/admin", "/desk", "/scan", "/score"],
  ADMIN: ["/admin", "/desk", "/scan", "/score"],
  OFFICIAL: ["/desk", "/scan", "/score"],
  MEDICAL: ["/medical"],
  COACH: ["/coach"],
};

export function staffHomeFor(role: string): string {
  return HOME[role] ?? "/";
}

/**
 * Where to send staff after signing in: the page they were trying to open if their role may see it
 * (same-site paths only), otherwise their own home page — never straight onto "Access denied".
 */
export function staffLandingFor(role: string, callbackUrl?: string | null): string {
  const home = staffHomeFor(role);
  if (!callbackUrl || !callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) return home;
  const p = callbackUrl.split(/[?#]/)[0];
  const isStaffArea = Object.values(AREAS).flat().some((a) => p === a || p.startsWith(`${a}/`));
  if (!isStaffArea) return callbackUrl; // public pages are fine for anyone
  return (AREAS[role] ?? []).some((a) => p === a || p.startsWith(`${a}/`)) ? callbackUrl : home;
}
