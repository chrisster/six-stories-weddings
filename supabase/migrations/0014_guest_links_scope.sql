alter table if exists public.guest_gallery_links
  add column if not exists share_scope text not null default 'full',
  add column if not exists media_asset_ids text[] null;

create index if not exists idx_guest_gallery_links_scope
  on public.guest_gallery_links(share_scope);
