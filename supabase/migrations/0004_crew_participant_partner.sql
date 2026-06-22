-- Add participant_type (inhouse/freelancer) and freelancer_fee to crew_assignments
alter table public.crew_assignments
  add column if not exists participant_type text not null default 'inhouse'
    check (participant_type in ('inhouse', 'freelancer')),
  add column if not exists freelancer_fee numeric(10, 2);

-- Extend crew_members role_type to include 'partner' (e.g. wedding planners)
alter table public.crew_members
  drop constraint if exists crew_members_role_type_check;

alter table public.crew_members
  add constraint crew_members_role_type_check
    check (role_type in ('photographer', 'videographer', 'editor', 'assistant', 'partner'));
