-- Guest gallery links for admin-controlled sharing
create table if not exists public.guest_gallery_links (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  token text not null unique,
  created_by text not null,
  created_at timestamp with time zone default now(),
  expires_at timestamp with time zone,
  is_active boolean default true,
  last_accessed_at timestamp with time zone,
  access_count integer default 0
);

-- RLS: Anyone can read if valid token (will validate in app logic)
-- Admins can create/update/delete their own links
alter table public.guest_gallery_links enable row level security;

drop policy if exists "allow_valid_token_read" on public.guest_gallery_links;
create policy "allow_valid_token_read" on public.guest_gallery_links
  for select
  to authenticated, anon
  using (
    is_active = true
    and (expires_at is null or expires_at > now())
  );

drop policy if exists "allow_admin_full_access" on public.guest_gallery_links;
create policy "allow_admin_full_access" on public.guest_gallery_links
  for all
  to authenticated
  using (auth.jwt() ->> 'role' = 'authenticated');

-- Index for fast token lookup
create index if not exists idx_guest_gallery_links_token on public.guest_gallery_links(token) where is_active = true;
create index if not exists idx_guest_gallery_links_gallery_id on public.guest_gallery_links(gallery_id);
