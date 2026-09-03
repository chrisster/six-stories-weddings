-- Performance: indexes on the columns the app filters by, a one-query cover
-- fallback, and gallery statistics computed in SQL.
--
-- Postgres does not index foreign keys automatically, so every gallery,
-- project and crew lookup was a sequential scan. Small today, but galleries
-- multiply and media_assets already holds thousands of rows.

create index if not exists media_assets_gallery_sort_idx
  on public.media_assets (gallery_id, sort_order);
create index if not exists media_assets_gallery_cover_idx
  on public.media_assets (gallery_id) where is_cover = true;
create index if not exists galleries_project_idx
  on public.galleries (project_id);
create index if not exists galleries_slug_published_idx
  on public.galleries (slug) where is_published = true;
create index if not exists gallery_sections_gallery_idx
  on public.gallery_sections (gallery_id, sort_order);
create index if not exists gallery_favorites_gallery_session_idx
  on public.gallery_favorites (gallery_id, guest_session_id);
create index if not exists gallery_comments_gallery_idx
  on public.gallery_comments (gallery_id);
create index if not exists gallery_events_gallery_created_idx
  on public.gallery_events (gallery_id, created_at);
create index if not exists crew_assignments_project_idx
  on public.crew_assignments (project_id);
create index if not exists crew_assignments_member_idx
  on public.crew_assignments (crew_member_id);
create index if not exists project_clients_project_idx
  on public.project_clients (project_id);
create index if not exists project_clients_client_idx
  on public.project_clients (client_id);
create index if not exists project_tasks_project_idx
  on public.project_tasks (project_id);
create index if not exists deliverables_project_idx
  on public.deliverables (project_id);
create index if not exists clients_email_lower_idx
  on public.clients (lower(email));

-- First photo of every gallery, for the cover fallback: one query for all
-- galleries instead of one round trip per gallery.
create or replace view public.gallery_first_photo as
  select distinct on (gallery_id) gallery_id, storage_path, sort_order
  from public.media_assets
  where media_type = 'photo'
  order by gallery_id, sort_order asc, created_at asc;

revoke all on public.gallery_first_photo from anon, authenticated;
grant select on public.gallery_first_photo to service_role;

-- Per-gallery view and download totals. The app used to download every
-- gallery_events row and count in JavaScript; PostgREST caps a select at
-- 1000 rows, so the dashboard silently undercounted once the table grew past
-- that. `viewers` counts distinct guest sessions per gallery.
create or replace function public.gallery_event_stats(
  since_at timestamptz default null,
  gallery_ids uuid[] default null
)
returns table (gallery_id uuid, views bigint, viewers bigint, downloads bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.gallery_id,
    count(*) filter (where e.event_type = 'view') as views,
    count(distinct e.guest_session_id)
      filter (where e.event_type = 'view' and e.guest_session_id is not null) as viewers,
    count(*) filter (where e.event_type = 'download') as downloads
  from public.gallery_events e
  where (since_at is null or e.created_at >= since_at)
    and (gallery_ids is null or e.gallery_id = any (gallery_ids))
  group by e.gallery_id;
$$;

revoke all on function public.gallery_event_stats(timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.gallery_event_stats(timestamptz, uuid[]) to service_role;
