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

## Cloud Deployment (Vercel + Custom Domain)

1. Push repository to GitHub.
2. Import repo in Vercel.
3. Add production environment variables in Vercel project settings.
4. Set `APP_URL` to the production domain:

- `https://admin.sixstoriesstudio.com`

5. In Supabase Auth settings:

- Site URL: `https://admin.sixstoriesstudio.com`
- Redirect URLs: add `https://admin.sixstoriesstudio.com/*`

6. In your DNS provider:

- Add a CNAME record for `admin` pointing to the Vercel target (e.g. `cname.vercel-dns.com`)
- Verify and assign the domain in Vercel project settings (Domains tab)

7. Deploy.

> **Routing note:** When accessed via `admin.sixstoriesstudio.com`, the root path `/` automatically redirects to `/admin`. Authentication is enforced via Next.js middleware — unauthenticated visitors are sent to `/login`.

## Notes

- If Supabase env vars are missing, the app runs in demo mode automatically.
- Media upload requires Supabase configured and authenticated admin user.
- Storage bucket used by default: `wedding-media`.
