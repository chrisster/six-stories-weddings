-- Gallery analytics: views and downloads
create table if not exists public.gallery_events (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  event_type text not null check (event_type in ('view', 'download')),
  media_asset_id uuid references public.media_assets(id) on delete set null,
  guest_session_id text,
  created_at timestamptz not null default now()
);

create index if not exists gallery_events_gallery_idx on public.gallery_events(gallery_id);
create index if not exists gallery_events_type_idx on public.gallery_events(event_type);

alter table public.gallery_events enable row level security;

-- Events are written server-side with the service role, which bypasses RLS.
-- Block any direct client access.
drop policy if exists "gallery_events_no_direct" on public.gallery_events;
create policy "gallery_events_no_direct"
  on public.gallery_events
  for all
  to anon, authenticated
  using (false)
  with check (false);
