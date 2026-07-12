-- Separate phone for crew members
alter table public.crew_members
  add column if not exists phone text;
