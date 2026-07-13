-- 0025_password_setup_tokens.sql
-- Self-owned, single-use tokens for setting/resetting a password without
-- relying on Supabase recovery links (which are consumed by email link
-- scanners and require a live client session -> "Auth session missing").
create table if not exists public.password_setup_tokens (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_setup_tokens_hash_idx
  on public.password_setup_tokens (token_hash);

create index if not exists password_setup_tokens_email_idx
  on public.password_setup_tokens (email);

alter table public.password_setup_tokens enable row level security;

drop policy if exists password_setup_tokens_no_direct on public.password_setup_tokens;
create policy password_setup_tokens_no_direct
  on public.password_setup_tokens
  for all
  using (false)
  with check (false);
