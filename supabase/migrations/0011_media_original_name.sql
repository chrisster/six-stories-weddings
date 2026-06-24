-- Store the original upload filename so galleries can display real photo names
-- (e.g. "PANA4937"), and make client favorites unique per guest so toggling is
-- idempotent. Safe to run multiple times.

alter table public.media_assets
  add column if not exists original_name text;

create unique index if not exists gallery_favorites_unique
  on public.gallery_favorites (gallery_id, media_asset_id, guest_session_id);
