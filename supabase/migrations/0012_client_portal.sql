create table if not exists public.client_portal_accounts (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  password_hash text,
  is_active boolean not null default true,
  last_login_at timestamptz,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gallery_notification_templates (
  gallery_id uuid primary key references public.galleries(id) on delete cascade,
  email_subject text,
  email_headline text,
  email_intro text,
  email_body text,
  button_label text,
  share_note text,
  hero_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_portal_accounts enable row level security;
alter table public.gallery_notification_templates enable row level security;

create policy "admin full client_portal_accounts"
on public.client_portal_accounts for all
to authenticated
using (true)
with check (true);

create policy "admin full gallery_notification_templates"
on public.gallery_notification_templates for all
to authenticated
using (true)
with check (true);