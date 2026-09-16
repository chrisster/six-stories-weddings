-- Extra recipients on a contract.
--
-- The signer stays a single person: one signing link, one signature. Anyone
-- listed here is CC'd on the invitation and on the signed copy, which covers
-- the usual case of a couple where one partner signs and both keep the
-- paperwork. The studio's own CC address (organization_settings.contract_cc_email)
-- is applied on top of this list at send time and is not stored here.
--
-- Safe to re-run.

alter table public.contracts
  add column if not exists cc_emails jsonb not null default '[]'::jsonb;
