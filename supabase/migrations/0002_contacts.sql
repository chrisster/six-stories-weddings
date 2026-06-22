create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  event_date date,
  offer_amount numeric(12, 2),
  status text not null default 'lead' check (status in ('lead', 'offer_sent', 'confirmed', 'converted', 'rejected')),
  notes text,
  converted_client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contacts enable row level security;

create policy "admin full contacts"
on public.contacts for all
to authenticated
using (true)
with check (true);
