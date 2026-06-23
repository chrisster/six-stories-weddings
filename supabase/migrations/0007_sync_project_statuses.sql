-- Idempotent schema sync to fix project status saving (run safely on any prior state).
-- Fixes: legacy status constraint that rejected scheduled / post_production / negotiating / declined / draft.

-- 1) Drop whatever status constraint currently exists.
alter table public.projects
  drop constraint if exists projects_status_check;

-- 2) Map any legacy status values to the current taxonomy.
update public.projects
set status = case
  when status = 'confirmed' then 'scheduled'
  when status = 'unconfirmed' then 'draft'
  else status
end;

-- 3) Re-apply the current status constraint.
alter table public.projects
  add constraint projects_status_check
  check (status in ('draft', 'negotiating', 'scheduled', 'post_production', 'cancelled', 'declined'));

-- 4) Ensure referral column exists (used by the project edit form).
alter table public.projects
  add column if not exists referral text;
