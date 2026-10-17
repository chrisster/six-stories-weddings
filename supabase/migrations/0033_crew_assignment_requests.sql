-- Availability requests for crew assignments.
--
-- Adding someone to a project's crew now emails them a request with the
-- project, date, services, role and (for freelancers) fee. They answer from a
-- tokenised page without logging in, and the studio sees where it stands:
--
--   pending   created, but no email went out (no address on the crew member,
--             or email delivery is not configured)
--   emailed   request sent, not opened yet
--   seen      the response page was opened
--   accepted  confirmed availability
--   declined  not available
--
-- The response link is an HMAC of the assignment id, so nothing secret is
-- stored here and reminders can reuse the original link.
--
-- Assignments that existed before this migration are treated as accepted.
--
-- Safe to re-run.

alter table public.crew_assignments
  add column if not exists request_status text not null default 'accepted',
  add column if not exists emailed_at timestamptz,
  add column if not exists seen_at timestamptz,
  add column if not exists responded_at timestamptz,
  add column if not exists response_note text,
  add column if not exists reminder_count integer not null default 0,
  add column if not exists last_reminder_at timestamptz;

alter table public.crew_assignments
  drop constraint if exists crew_assignments_request_status_check;
alter table public.crew_assignments
  add constraint crew_assignments_request_status_check
  check (request_status in ('pending', 'emailed', 'seen', 'accepted', 'declined'));

-- The daily reminder job only looks at unanswered requests.
create index if not exists crew_assignments_open_requests_idx
  on public.crew_assignments (emailed_at)
  where request_status in ('emailed', 'seen');
