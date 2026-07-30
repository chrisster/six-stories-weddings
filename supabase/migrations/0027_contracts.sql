-- Contract send / sign / countersign.
--
-- Design notes:
--  * `contract_templates` holds the reusable wording. Merge fields use {{token}}
--    placeholders and are resolved server-side at send time.
--  * `contracts.template_snapshot` and `contracts.merge_data` freeze the exact
--    wording and studio/project values used for that one contract, so editing a
--    template later can never retroactively change what somebody already signed.
--  * `contract_events` is the audit trail. It is append-only in practice and is
--    what makes a simple electronic signature defensible (attribution, intent,
--    integrity, timestamps).

-- ---------------------------------------------------------------------------
-- Studio-side details needed on a contract (counterparty block + countersign)
-- ---------------------------------------------------------------------------
alter table public.organization_settings
  add column if not exists legal_name text,
  add column if not exists vat_id text,             -- ΑΦΜ
  add column if not exists tax_office text,         -- ΔΟΥ
  add column if not exists registry_no text,        -- ΓΕΜΗ
  add column if not exists representative_name text,
  add column if not exists bank_name text,
  add column if not exists bank_iban text,
  add column if not exists city text,               -- "Στη Θεσσαλονίκη, σήμερα…"
  add column if not exists signature_image_url text,
  add column if not exists contract_cc_email text;

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version integer not null default 1,
  language text not null default 'el',
  title text not null,
  -- Preamble shown above the numbered clauses. Supports {{merge}} fields.
  intro text,
  -- [{ "heading": "ΑΡΘΡΟ 1: …", "body": "…" }, …]
  clauses jsonb not null default '[]'::jsonb,
  closing text,
  -- Exact wording the signer must accept to sign electronically.
  consent_text text not null default
    'Δηλώνω ότι διάβασα και αποδέχομαι τους όρους του παρόντος συμφωνητικού και συναινώ στην ηλεκτρονική υπογραφή του.',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contract_templates_name_version_idx
  on public.contract_templates (name, version);

-- ---------------------------------------------------------------------------
-- Contracts
-- ---------------------------------------------------------------------------
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  template_id uuid references public.contract_templates(id) on delete set null,

  -- Frozen at send time — never re-read from the template afterwards.
  template_snapshot jsonb not null,
  merge_data jsonb not null default '{}'::jsonb,

  recipient_email text not null,
  recipient_name text,

  status text not null default 'draft'
    check (status in ('draft', 'sent', 'viewed', 'signed', 'void')),

  -- Signing link: only the SHA-256 hash is stored, like password_setup_tokens.
  token_hash text unique,
  expires_at timestamptz,

  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,

  -- Signer-provided fields. The template asks for city and street separately
  -- ("που κατοικεί στη πόλη … επί της οδού …"), so they are stored that way.
  signer_first_name text,
  signer_last_name text,
  signer_city text,
  signer_street text,
  signer_is_company boolean not null default false,
  signer_company_name text,
  signer_vat_id text,                                -- ΑΦΜ (required, 9 digits)
  signer_tax_office text,                            -- ΔΟΥ (companies)
  signer_email text,

  signature_kind text check (signature_kind in ('drawn', 'typed')),
  signature_data text,                               -- PNG data URL, or typed name
  consent_text text,                                 -- exact wording accepted
  signed_ip text,
  signed_user_agent text,

  -- Immutable signed artifact
  pdf_path text,
  pdf_sha256 text,

  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contracts_project_idx on public.contracts (project_id);
create index if not exists contracts_status_idx on public.contracts (status);
create index if not exists contracts_recipient_idx on public.contracts (lower(recipient_email));

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.contract_events (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  kind text not null
    check (kind in ('created', 'sent', 'reminder_sent', 'viewed', 'signed',
                    'copy_emailed', 'voided', 'pdf_downloaded')),
  meta jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists contract_events_contract_idx
  on public.contract_events (contract_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: service role only.
-- ---------------------------------------------------------------------------
-- Every read and write goes through server actions using the service-role
-- client, including the public signing page (which validates a token first).
-- Blocking anon/authenticated outright means a leaked anon key cannot enumerate
-- contracts, signer addresses, VAT ids, or signature images.

alter table public.contract_templates enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_events enable row level security;

drop policy if exists "contract_templates_no_direct" on public.contract_templates;
create policy "contract_templates_no_direct"
  on public.contract_templates for all
  to anon, authenticated
  using (false) with check (false);

drop policy if exists "contracts_no_direct" on public.contracts;
create policy "contracts_no_direct"
  on public.contracts for all
  to anon, authenticated
  using (false) with check (false);

drop policy if exists "contract_events_no_direct" on public.contract_events;
create policy "contract_events_no_direct"
  on public.contract_events for all
  to anon, authenticated
  using (false) with check (false);
