create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text unique not null,
  role text not null default 'admin' check (role in ('admin', 'editor', 'viewer')),
  full_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  project_code text,
  title text not null,
  event_date date not null,
  month text,
  project_type text,
  referral text,
  package_category text,
  status text not null default 'unconfirmed' check (status in ('confirmed', 'unconfirmed', 'cancelled')),
  shooting_status text,
  editing_status text not null default 'not_started' check (editing_status in ('not_started', 'in_progress', 'review', 'completed')),
  completed boolean not null default false,
  budget_total numeric(12, 2) not null default 0,
  amount_paid numeric(12, 2) not null default 0,
  amount_remaining numeric(12, 2) not null default 0,
  notes text,
  imported_source text,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_clients (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  role text,
  created_at timestamptz not null default now(),
  unique (project_id, client_id)
);

create table if not exists public.crew_members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role_type text not null check (role_type in ('photographer', 'videographer', 'editor', 'assistant')),
  contact_info text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.crew_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  crew_member_id uuid not null references public.crew_members(id) on delete cascade,
  assignment_role text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  due_date date,
  assignee_id uuid references public.crew_members(id),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  created_at timestamptz not null default now()
);

create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  deliverable_type text not null check (deliverable_type in ('photos', 'highlight_film', 'teaser', 'reel')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'delivered')),
  due_date date,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.galleries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  slug text unique not null,
  title text not null,
  cover_media_id uuid,
  is_published boolean not null default false,
  passcode_hash text,
  allow_downloads boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gallery_sections (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  section_id uuid references public.gallery_sections(id) on delete set null,
  storage_provider text not null default 'supabase',
  storage_bucket text,
  storage_path text not null,
  media_type text not null check (media_type in ('photo', 'video')),
  width int,
  height int,
  duration_sec int,
  sort_order int not null default 0,
  is_cover boolean not null default false,
  metadata_json jsonb,
  created_at timestamptz not null default now()
);

alter table public.galleries
  add constraint galleries_cover_media_fk
  foreign key (cover_media_id)
  references public.media_assets(id)
  on delete set null;

create table if not exists public.gallery_favorites (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  guest_session_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.gallery_comments (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  guest_name text,
  comment_body text not null,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('wedding-media', 'wedding-media', false)
on conflict (id) do nothing;

alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_clients enable row level security;
alter table public.crew_members enable row level security;
alter table public.crew_assignments enable row level security;
alter table public.project_tasks enable row level security;
alter table public.deliverables enable row level security;
alter table public.galleries enable row level security;
alter table public.gallery_sections enable row level security;
alter table public.media_assets enable row level security;
alter table public.gallery_favorites enable row level security;
alter table public.gallery_comments enable row level security;

create policy "admin read users"
on public.users for select
to authenticated
using (true);

create policy "admin full clients"
on public.clients for all
to authenticated
using (true)
with check (true);

create policy "admin full projects"
on public.projects for all
to authenticated
using (true)
with check (true);

create policy "admin full project_clients"
on public.project_clients for all
to authenticated
using (true)
with check (true);

create policy "admin full crew_members"
on public.crew_members for all
to authenticated
using (true)
with check (true);

create policy "admin full crew_assignments"
on public.crew_assignments for all
to authenticated
using (true)
with check (true);

create policy "admin full project_tasks"
on public.project_tasks for all
to authenticated
using (true)
with check (true);

create policy "admin full deliverables"
on public.deliverables for all
to authenticated
using (true)
with check (true);

create policy "admin full galleries"
on public.galleries for all
to authenticated
using (true)
with check (true);

create policy "admin full gallery_sections"
on public.gallery_sections for all
to authenticated
using (true)
with check (true);

create policy "admin full media_assets"
on public.media_assets for all
to authenticated
using (true)
with check (true);

create policy "public can read published galleries"
on public.galleries for select
to anon, authenticated
using (is_published = true);

create policy "public can read published gallery sections"
on public.gallery_sections for select
to anon, authenticated
using (
  exists (
    select 1 from public.galleries g
    where g.id = gallery_sections.gallery_id
      and g.is_published = true
  )
);

create policy "public can read published media"
on public.media_assets for select
to anon, authenticated
using (
  exists (
    select 1 from public.galleries g
    where g.id = media_assets.gallery_id
      and g.is_published = true
  )
);

create policy "public can favorite"
on public.gallery_favorites for insert
to anon, authenticated
with check (
  exists (
    select 1 from public.galleries g
    where g.id = gallery_favorites.gallery_id
      and g.is_published = true
  )
);

create policy "public can comment"
on public.gallery_comments for insert
to anon, authenticated
with check (
  exists (
    select 1 from public.galleries g
    where g.id = gallery_comments.gallery_id
      and g.is_published = true
  )
);

create policy "public can read favorites"
on public.gallery_favorites for select
to anon, authenticated
using (true);

create policy "public can read comments"
on public.gallery_comments for select
to anon, authenticated
using (true);

create policy "authenticated upload wedding media"
on storage.objects for insert
to authenticated
with check (bucket_id = 'wedding-media');

create policy "authenticated select wedding media"
on storage.objects for select
to authenticated
using (bucket_id = 'wedding-media');