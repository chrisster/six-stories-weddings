alter table if exists public.guest_gallery_links enable row level security;

drop policy if exists "allow_valid_token_read" on public.guest_gallery_links;
drop policy if exists "allow_admin_full_access" on public.guest_gallery_links;

-- Access is only via server-side service role in app code.
create policy "guest_links_no_direct_client_access"
  on public.guest_gallery_links
  for all
  to authenticated, anon
  using (false)
  with check (false);
