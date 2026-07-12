create table if not exists public.organization_settings (
  id text primary key default 'default',
  studio_name text,
  contact_email text,
  reply_to_email text,
  phone text,
  website text,
  address text,
  updated_at timestamptz not null default now()
);

insert into public.organization_settings (id) values ('default')
  on conflict (id) do nothing;

alter table public.organization_settings enable row level security;

-- Managed server-side with the service role only.
drop policy if exists "org_settings_no_direct" on public.organization_settings;
create policy "org_settings_no_direct"
  on public.organization_settings
  for all
  to anon, authenticated
  using (false)
  with check (false);
