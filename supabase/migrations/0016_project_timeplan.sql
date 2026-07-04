alter table if exists public.projects
  add column if not exists timeplan_json jsonb not null default '[]'::jsonb;
