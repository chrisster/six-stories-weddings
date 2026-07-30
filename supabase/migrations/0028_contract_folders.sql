-- Folders for organising and archiving contracts.
--
-- Deliberately a plain flat list rather than a tree: contracts are archived by
-- year or client, and nesting adds UI cost with no real benefit here.

create table if not exists public.contract_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Marks a folder as an archive so its contracts can be hidden from the
  -- default view without being deleted.
  is_archive boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contract_folders_name_idx
  on public.contract_folders (lower(name));

-- on delete set null: removing a folder must never cascade into deleting the
-- contracts filed inside it. They fall back to the unfiled view instead.
alter table public.contracts
  add column if not exists folder_id uuid
    references public.contract_folders(id) on delete set null;

create index if not exists contracts_folder_idx on public.contracts (folder_id);

alter table public.contract_folders enable row level security;

drop policy if exists "contract_folders_no_direct" on public.contract_folders;
create policy "contract_folders_no_direct"
  on public.contract_folders for all
  to anon, authenticated
  using (false) with check (false);
