-- Add structured financial fields on projects.
-- Safe to run multiple times.

alter table public.projects
  add column if not exists offer_amount numeric(12, 2);

alter table public.projects
  add column if not exists payments_json jsonb not null default '[]'::jsonb;

update public.projects
set offer_amount = coalesce(offer_amount, budget_total, 0)
where offer_amount is null;
