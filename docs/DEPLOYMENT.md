# Deployment (Vercel + Supabase)

Live preview: https://sports-sphere-platform.vercel.app (demo mode: OTPs shown on screen, all data fictional).

## How it is wired
- **Vercel project** `sports-sphere-platform` (team `bhavika8`), functions in Mumbai (`bom1`, see `vercel.json`).
- **Supabase** database `sports-sphere-db` (free plan, Mumbai), added through the Vercel Marketplace, so its
  `POSTGRES_*` / `SUPABASE_*` variables are managed by Vercel automatically.
- App settings on Vercel (production): `DATABASE_URL` (the pooled `POSTGRES_PRISMA_URL` + `connection_limit=1`),
  `NEXTAUTH_SECRET`, `QR_SIGNING_SECRET`, `DEMO_MODE=true`, `NEXTAUTH_URL` and `PUBLIC_BASE_URL` (the site address).
- The Prisma provider switches to PostgreSQL automatically on Vercel because `DATABASE_URL` starts with `postgres`.
- Uploaded documents go to the private Supabase Storage bucket `uploads` (`src/lib/storage.ts`) when
  `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set; locally they still go to `./uploads`.

## Redeploy
    npx vercel@latest deploy --prod

## Reload the demo data on Supabase
    npx vercel@latest env pull .env.production.local --environment=production --yes
    (set -a; . ./.env.production.local; set +a; export DATABASE_URL="$POSTGRES_URL_NON_POOLING"; \
      node scripts/prisma-provider.mjs && npx prisma generate && npx prisma db push && npx prisma db seed)
    DATABASE_URL=file:./dev.db node scripts/prisma-provider.mjs && npx prisma generate   # back to local SQLite

## Known limits of the preview
- Vercel rejects request bodies over ~4.5 MB, so uploads between 4.5 and 5 MB fail with a generic error.
- Rate limits (OTP sends, logins) are kept in memory per server instance, so they are looser than on one server.
- Before real use: set `DEMO_MODE=false`, configure SMS/email, and use real identity services.
