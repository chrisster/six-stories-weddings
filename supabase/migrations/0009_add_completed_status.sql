-- Add 'completed' to the allowed project statuses.
-- Safe/idempotent: drops and re-creates the status check constraint.

alter table public.projects
  drop constraint if exists projects_status_check;

alter table public.projects
  add constraint projects_status_check
  check (status in ('draft', 'negotiating', 'scheduled', 'post_production', 'completed', 'cancelled', 'declined'));
