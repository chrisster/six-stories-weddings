-- Post-production task board: kinds and expanded statuses
alter table public.project_tasks
  add column if not exists kind text;

alter table public.project_tasks drop constraint if exists project_tasks_status_check;
alter table public.project_tasks
  add constraint project_tasks_status_check
  check (status in ('backlog', 'stand_by', 'todo', 'in_progress', 'review', 'done'));

create index if not exists project_tasks_kind_idx on public.project_tasks(kind);
