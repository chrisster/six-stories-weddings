-- Timestamped comments for gallery videos
alter table if exists public.gallery_comments
  add column if not exists timestamp_seconds integer;

create index if not exists gallery_comments_media_idx
  on public.gallery_comments (media_asset_id);
