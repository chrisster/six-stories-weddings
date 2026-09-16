-- 0031_lock_down_direct_table_access.sql
--
-- The public anon key ships in the browser bundle, and Supabase Auth hands an
-- `authenticated` token to anyone who signs up. The original policies trusted
-- both: the anon key could read every published gallery, its sections and its
-- media rows (storage keys included, so the photos themselves on the public
-- media domain) plus all favorites and comments, and any authenticated token
-- could read and write clients, contacts, projects, portal password hashes and
-- the rest of the studio data.
--
-- The app never uses either key for tables: every read and write goes through
-- the service role on the server, which bypasses RLS. Direct access is
-- therefore closed here the way the newer tables already are (`*_no_direct`
-- policies). The one direct use that stays is Supabase Storage, limited to
-- studio staff.
--
-- Safe to re-run.

-- Studio staff: the caller has an active admin or crew row in public.users.
create or replace function public.is_studio_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.active
      and u.role in ('admin', 'crew')
  );
$$;

revoke all on function public.is_studio_staff() from public, anon;
grant execute on function public.is_studio_staff() to authenticated;

-- Studio data that any signed-in account could read and write.
drop policy if exists "admin read users" on public.users;
drop policy if exists "admin full clients" on public.clients;
drop policy if exists "admin full projects" on public.projects;
drop policy if exists "admin full project_clients" on public.project_clients;
drop policy if exists "admin full crew_members" on public.crew_members;
drop policy if exists "admin full crew_assignments" on public.crew_assignments;
drop policy if exists "admin full project_tasks" on public.project_tasks;
drop policy if exists "admin full deliverables" on public.deliverables;
drop policy if exists "admin full galleries" on public.galleries;
drop policy if exists "admin full gallery_sections" on public.gallery_sections;
drop policy if exists "admin full media_assets" on public.media_assets;
drop policy if exists "admin full contacts" on public.contacts;
drop policy if exists "admin full client_portal_accounts" on public.client_portal_accounts;
drop policy if exists "admin full gallery_notification_templates" on public.gallery_notification_templates;

-- Gallery data the anon key could read or write. Guests and clients reach
-- galleries only through the app, which checks portal sessions and guest links.
drop policy if exists "public can read published galleries" on public.galleries;
drop policy if exists "public can read published gallery sections" on public.gallery_sections;
drop policy if exists "public can read published media" on public.media_assets;
drop policy if exists "public can favorite" on public.gallery_favorites;
drop policy if exists "public can read favorites" on public.gallery_favorites;
drop policy if exists "public can comment" on public.gallery_comments;
drop policy if exists "public can read comments" on public.gallery_comments;

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'clients', 'projects', 'project_clients', 'crew_members',
    'crew_assignments', 'project_tasks', 'deliverables', 'galleries',
    'gallery_sections', 'media_assets', 'gallery_favorites', 'gallery_comments',
    'contacts', 'client_portal_accounts', 'gallery_notification_templates'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_no_direct', t);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (false) with check (false)',
      t || '_no_direct',
      t
    );
  end loop;
end
$$;

-- Supabase Storage (the fallback media store). Uploads use signed URLs issued
-- by the service role, so direct object access is only ever needed by staff.
drop policy if exists "authenticated upload wedding media" on storage.objects;
drop policy if exists "authenticated select wedding media" on storage.objects;
drop policy if exists "staff upload wedding media" on storage.objects;
drop policy if exists "staff select wedding media" on storage.objects;

create policy "staff upload wedding media"
on storage.objects for insert
to authenticated
with check (bucket_id = 'wedding-media' and public.is_studio_staff());

create policy "staff select wedding media"
on storage.objects for select
to authenticated
using (bucket_id = 'wedding-media' and public.is_studio_staff());

-- Every policy left, so the SQL editor shows the result of the run.
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;
