# Six Stories Weddings

Premium wedding project management and private client gallery platform for Six Stories Studio.

## Current MVP Scope

- Admin dashboard for project tracking, finances, crew, tasks, and deliverables
- Projects list with search and status filters
- Project detail pages with linked gallery manager
- Gallery manager for section creation, media upload, cover selection, and publish settings
- Public client gallery at `/g/[gallerySlug]` with passcode protection and lightbox
- Supabase database/auth/storage support
- Demo mode fallback with seeded sample data (no CSV import)

## Tech Stack

- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Postgres, Auth, Storage)
- React Hook Form + Zod (ready for forms expansion)

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env file and fill values:

```bash
cp .env.example .env.local
```

Required env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL`

3. Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Supabase Setup

1. Create a Supabase project.
2. In Supabase SQL Editor, run [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql).
3. Seed demo data:

```bash
npm run seed:demo
```

Seed output includes demo gallery credentials:

- Slug: `joost-stav-2026`
- Passcode: `sixstories2026`

## Routes

- `/admin`
- `/admin/projects`
- `/admin/projects/[id]`
- `/admin/calendar`
- `/admin/galleries`
- `/admin/galleries/[id]`
- `/g/[gallerySlug]`

## Cloud Deployment (Vercel + Plesk Subdomain)

Use this when moving from `https://six-stories-weddings-*.vercel.app` to a branded subdomain like `https://weddings.sixstoriesstudio.com`.

### Minimum required (for domain cutover)

1. In **Vercel → Project → Settings → Domains**, add `weddings.sixstoriesstudio.com`.
2. In **Plesk → Domains → sixstoriesstudio.com → Add Subdomain**, create `weddings`.
3. In **Plesk DNS settings**, set a **CNAME** for `weddings` to Vercel's target (`cname.vercel-dns.com`, or the exact value shown in Vercel).
4. Back in Vercel, wait until the domain status is verified.

### Do the rest in order (production correctness)

5. In **Vercel → Settings → Environment Variables**, set:
   - `APP_URL=https://weddings.sixstoriesstudio.com`
6. In **Supabase → Authentication → URL Configuration**, set:
   - Site URL: `https://weddings.sixstoriesstudio.com`
   - Redirect URLs: `https://weddings.sixstoriesstudio.com/*`
7. Redeploy from Vercel (or trigger a new production deployment).
8. Smoke test:
   - Open home, `/admin`, and one gallery link on the custom domain.
   - Confirm auth redirects stay on `weddings.sixstoriesstudio.com` (not `*.vercel.app`).

## Notes

- If Supabase env vars are missing, the app runs in demo mode automatically.
- Media upload requires Supabase configured and authenticated admin user.
- Storage bucket used by default: `wedding-media`.
