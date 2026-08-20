-- Per-gallery toggle for client comments. Off by default: comments only
-- appear on galleries where the studio explicitly enables them.
alter table public.galleries
  add column if not exists allow_comments boolean not null default false;
