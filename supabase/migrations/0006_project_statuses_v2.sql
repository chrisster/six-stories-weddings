alter table projects
  drop constraint if exists projects_status_check;

update projects
set status = case
  when status = 'confirmed' then 'scheduled'
  when status = 'unconfirmed' then 'draft'
  else status
end;

alter table projects
  add constraint projects_status_check
  check (status in ('draft', 'negotiating', 'scheduled', 'post_production', 'cancelled', 'declined'));
