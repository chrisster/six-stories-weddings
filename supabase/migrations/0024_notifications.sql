create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  type text not null default 'general',
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx on public.notifications(recipient_email);
create index if not exists notifications_unread_idx on public.notifications(recipient_email, read);

alter table public.notifications enable row level security;

-- Written and read server-side with the service role only.
drop policy if exists "notifications_no_direct" on public.notifications;
create policy "notifications_no_direct"
  on public.notifications
  for all
  to anon, authenticated
  using (false)
  with check (false);
