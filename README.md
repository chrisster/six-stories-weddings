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

If your app is already live on Vercel and you want to replace the `*.vercel.app` URL with your own subdomain (for example `weddings.sixstoriesstudio.com`), do this in order:

1. In **Vercel → Project → Settings → Domains**, add your subdomain (example: `weddings.sixstoriesstudio.com`).
2. In **Plesk → Domains → sixstoriesstudio.com → Add Subdomain**, create the same subdomain (`weddings`).
3. In **Plesk DNS settings**, add/update a **CNAME** record for that subdomain pointing to Vercel's target (typically `cname.vercel-dns.com`, or exactly what Vercel shows for your project).
4. Back in Vercel, wait for domain verification to turn valid.
5. In Vercel environment variables, set `APP_URL=https://weddings.sixstoriesstudio.com`.
6. In Supabase Auth settings:
   - Site URL: `https://weddings.sixstoriesstudio.com`
   - Redirect URLs: `https://weddings.sixstoriesstudio.com/*`
7. Redeploy the project from Vercel so all runtime config uses the custom domain.

## Notes

- If Supabase env vars are missing, the app runs in demo mode automatically.
- Media upload requires Supabase configured and authenticated admin user.
- Storage bucket used by default: `wedding-media`.
