-- Unify crew management under Team: crew members can have an email and a login
alter table public.crew_members
  add column if not exists email text;

alter table public.crew_members
  add column if not exists auth_user_id uuid;

alter table public.crew_members drop constraint if exists crew_members_role_type_check;
alter table public.crew_members
  add constraint crew_members_role_type_check
  check (role_type in ('photographer', 'videographer', 'editor', 'assistant', 'partner'));
