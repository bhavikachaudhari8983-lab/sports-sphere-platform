/**
 * Demo mode shows OTPs on screen, exposes demo helper data and lets the mock (fictional) services answer.
 * Never enable in production. A production server (NODE_ENV=production) is in demo mode only when
 * DEMO_MODE="true" is set explicitly, so forgetting the variable fails safe.
 */
export function isDemoMode(): boolean {
  const v = process.env.DEMO_MODE;
  if (v === "true") return true;
  if (v === "false") return false;
  return process.env.NODE_ENV !== "production";
}
