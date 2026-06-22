-- Add new project statuses: negotiating, declined, draft
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('confirmed', 'unconfirmed', 'cancelled', 'negotiating', 'declined', 'draft'));
