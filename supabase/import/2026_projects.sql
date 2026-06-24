-- ---------------------------------------------------------------------------
-- Import: Six Stories 2026 season (12 projects)
-- Source: "Six stories 2026.xlsx"
--
-- Safe to run multiple times: each project is inserted only if a project with
-- the same title + event_date does not already exist. Crew members are matched
-- by name so they are never duplicated across runs.
--
-- Paste this whole file into the Supabase SQL Editor and Run.
-- ---------------------------------------------------------------------------

-- 0) Make sure the optional financial columns and status values exist
--    (idempotent — mirrors migrations 0008 + 0009).
alter table public.projects
  add column if not exists offer_amount numeric(12, 2);

alter table public.projects
  add column if not exists payments_json jsonb not null default '[]'::jsonb;

alter table public.projects
  drop constraint if exists projects_status_check;

alter table public.projects
  add constraint projects_status_check
  check (status in ('draft', 'negotiating', 'scheduled', 'post_production', 'completed', 'cancelled', 'declined'));

-- 1) Session-local helper functions (auto-dropped at end of session).
create or replace function pg_temp.add_client(p_project uuid, p_name text, p_email text)
returns void as $f$
declare
  v_client uuid;
begin
  insert into public.clients (full_name, email)
  values (p_name, p_email)
  returning id into v_client;

  insert into public.project_clients (project_id, client_id, role)
  values (p_project, v_client, 'couple');

  if p_email is not null and not exists (
    select 1 from public.contacts where email = p_email
  ) then
    insert into public.contacts (full_name, email, status, converted_client_id)
    values (p_name, p_email, 'confirmed', v_client);
  end if;
end;
$f$ language plpgsql;

create or replace function pg_temp.add_crew(p_project uuid, p_crew uuid, p_role text, p_participant text)
returns void as $f$
begin
  insert into public.crew_assignments (project_id, crew_member_id, assignment_role, participant_type)
  values (p_project, p_crew, p_role, p_participant);
end;
$f$ language plpgsql;

create or replace function pg_temp.add_gallery(p_project uuid, p_base text, p_title text)
returns void as $f$
begin
  insert into public.galleries (project_id, slug, title, is_published, allow_downloads)
  values (
    p_project,
    coalesce(nullif(p_base, ''), 'wedding') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    p_title || ' Gallery',
    false,
    false
  );
end;
$f$ language plpgsql;

-- 2) Main import.
do $$
declare
  v_chris      uuid;
  v_ares       uuid;
  v_vicky      uuid;
  v_theofilos  uuid;
  v_stathis    uuid;
  v_project    uuid;
begin
  -- Crew members (matched by name, created once).
  select id into v_chris from public.crew_members where full_name = 'Chris' limit 1;
  if v_chris is null then
    insert into public.crew_members (full_name, role_type, active)
    values ('Chris', 'photographer', true) returning id into v_chris;
  end if;

  select id into v_ares from public.crew_members where full_name = 'Aristomenis' limit 1;
  if v_ares is null then
    insert into public.crew_members (full_name, role_type, active)
    values ('Aristomenis', 'videographer', true) returning id into v_ares;
  end if;

  select id into v_vicky from public.crew_members where full_name = 'Vicky Kopaila' limit 1;
  if v_vicky is null then
    insert into public.crew_members (full_name, role_type, active)
    values ('Vicky Kopaila', 'videographer', true) returning id into v_vicky;
  end if;

  select id into v_theofilos from public.crew_members where full_name = 'Theofilos' limit 1;
  if v_theofilos is null then
    insert into public.crew_members (full_name, role_type, active)
    values ('Theofilos', 'photographer', true) returning id into v_theofilos;
  end if;

  select id into v_stathis from public.crew_members where full_name = 'Stathis' limit 1;
  if v_stathis is null then
    insert into public.crew_members (full_name, role_type, active)
    values ('Stathis', 'photographer', true) returning id into v_stathis;
  end if;

  -- ----- 1. Adrien & Anna -------------------------------------------------
  if not exists (select 1 from public.projects where title = 'Adrien & Anna' and event_date = '2026-08-18') then
    insert into public.projects
      (title, event_date, month, project_type, status, offer_amount, budget_total, amount_paid, amount_remaining, payments_json)
    values
      ('Adrien & Anna', '2026-08-18', '2026-08', 'Wedding|photo,film', 'scheduled',
       4000, 4000, 1200, 2800, '[{"date":"2025-12-22","amount":1200}]'::jsonb)
    returning id into v_project;

    perform pg_temp.add_client(v_project, 'Adrien Sicoli', 'adrien@dixio.me');
    perform pg_temp.add_client(v_project, 'Anna Tsakalidou', 'atsakalidou82@gmail.com');
    perform pg_temp.add_crew(v_project, v_chris, 'videographer', 'inhouse');
    perform pg_temp.add_crew(v_project, v_theofilos, 'photographer', 'freelancer');
    perform pg_temp.add_crew(v_project, v_vicky, 'videographer', 'freelancer');
    perform pg_temp.add_crew(v_project, v_stathis, 'photographer', 'freelancer');
    perform pg_temp.add_gallery(v_project, 'adrien-anna', 'Adrien & Anna');
  end if;

  -- ----- 2. Christopher & Sophia ------------------------------------------
  if not exists (select 1 from public.projects where title = 'Christopher & Sophia' and event_date = '2026-08-28') then
    insert into public.projects
      (title, event_date, month, project_type, status, offer_amount, budget_total, amount_paid, amount_remaining, payments_json)
    values
      ('Christopher & Sophia', '2026-08-28', '2026-08', 'Wedding|photo,film', 'scheduled',
       3800, 3800, 1140, 2660, '[{"date":"2025-02-25","amount":1140}]'::jsonb)
    returning id into v_project;

    perform pg_temp.add_client(v_project, 'Christopher', null);
    perform pg_temp.add_client(v_project, 'Sophia Arvanis', 'arvanishq@gmail.com');
    perform pg_temp.add_crew(v_project, v_chris, 'photographer', 'inhouse');
    perform pg_temp.add_crew(v_project, v_ares, 'videographer', 'inhouse');
    perform pg_temp.add_gallery(v_project, 'christopher-sophia', 'Christopher & Sophia');
  end if;

  -- ----- 3. Κούλα (Baptism) -----------------------------------------------
  if not exists (select 1 from public.projects where title = 'Κούλα' and event_date = '2026-08-30') then
    insert into public.projects
      (title, event_date, month, project_type, status, offer_amount, budget_total, amount_paid, amount_remaining, payments_json)
    values
      ('Κούλα', '2026-08-30', '2026-08', 'Baptism|photo,film', 'scheduled',
       600, 600, 0, 600, '[]'::jsonb)
    returning id into v_project;

    perform pg_temp.add_client(v_project, 'Κούλα', 'kyrikara92@gmail.com');
    perform pg_temp.add_crew(v_project, v_chris, 'photographer', 'inhouse');
    perform pg_temp.add_crew(v_project, v_vicky, 'videographer', 'freelancer');
    perform pg_temp.add_gallery(v_project, 'koula', 'Κούλα');
  end if;

  -- ----- 4. Ιωάννα (Baptism) ----------------------------------------------
  if not exists (select 1 from public.projects where title = 'Ιωάννα' and event_date = '2026-05-09') then
    insert into public.projects
      (title, event_date, month, project_type, status, offer_amount, budget_total, amount_paid, amount_remaining, payments_json)
    values
      ('Ιωάννα', '2026-05-09', '2026-05', 'Baptism|photo,film', 'scheduled',
       1500, 1500, 605, 895, '[{"date":"2026-03-12","amount":605}]'::jsonb)
    returning id into v_project;

    perform pg_temp.add_client(v_project, 'Ιωάννα', 'ioanna__15@hotmail.com');
    perform pg_temp.add_crew(v_project, v_ares, 'videographer', 'inhouse');
    perform pg_temp.add_crew(v_project, v_chris, 'photographer', 'inhouse');
    perform pg_temp.add_gallery(v_project, 'ioanna', 'Ιωάννα');
  end if;

  -- ----- 5. Ilias & Katerina ----------------------------------------------
  if not exists (select 1 from public.projects where title = 'Ilias & Katerina' and event_date = '2026-06-09') then
    insert into public.projects
      (title, event_date, month, project_type, status, offer_amount, budget_total, amount_paid, amount_remaining, payments_json)
    values
      ('Ilias & Katerina', '2026-06-09', '2026-06', 'Wedding|photo,film', 'scheduled',
       3500, 3500, 500, 3000, '[{"date":"2026-11-05","amount":500}]'::jsonb)
    returning id into v_project;

    perform pg_temp.add_client(v_project, 'Ηλίας Τσιούρης', 'iltsiour@gmail.com');
    perform pg_temp.add_client(v_project, 'Katerina', null);
    perform pg_temp.add_crew(v_project, v_ares, 'videographer', 'inhouse');
    perform pg_temp.add_crew(v_project, v_chris, 'photographer', 'inhouse');
    perform pg_temp.add_gallery(v_project, 'ilias-katerina', 'Ilias & Katerina');
  end if;

  -- ----- 6. Ελένη & Timm --------------------------------------------------
  if not exists (select 1 from public.projects where title = 'Ελένη & Timm' and event_date = '2026-12-09') then
    insert into public.projects
      (title, event_date, month, project_type, status, offer_amount, budget_total, amount_paid, amount_remaining, payments_json)
    values
      ('Ελένη & Timm', '2026-12-09', '2026-12', 'Wedding|photo,film', 'scheduled',
       3500, 3500, 1150, 2350, '[{"date":"2025-09-11","amount":1150}]'::jsonb)
    returning id into v_project;

    perform pg_temp.add_client(v_project, 'Ελένη', 'timmeleni11@gmail.com');
    perform pg_temp.add_crew(v_project, v_ares, 'videographer', 'inhouse');
    perform pg_temp.add_crew(v_project, v_chris, 'photographer', 'inhouse');
    perform pg_temp.add_gallery(v_project, 'timm', 'Ελένη & Timm');
  end if;

  -- ----- 7. Καλιόπη -------------------------------------------------------
  if not exists (select 1 from public.projects where title = 'Καλιόπη' and event_date = '2026-09-18') then
    insert into public.projects
      (title, event_date, month, project_type, status, offer_amount, budget_total, amount_paid, amount_remaining, payments_json)
    values
      ('Καλιόπη', '2026-09-18', '2026-09', 'Wedding|photo,film', 'scheduled',
       3900, 3900, 485, 3415, '[{"date":"2026-02-03","amount":485}]'::jsonb)
    returning id into v_project;

    perform pg_temp.add_client(v_project, 'Καλιόπη', 'kaltseliou@gmail.com');
    perform pg_temp.add_crew(v_project, v_ares, 'videographer', 'inhouse');
    perform pg_temp.add_crew(v_project, v_theofilos, 'photographer', 'freelancer');
    perform pg_temp.add_gallery(v_project, 'kaliopi', 'Καλιόπη');
  end if;

  -- ----- 8. Marianthi & Lennart -------------------------------------------
  if not exists (select 1 from public.projects where title = 'Marianthi & Lennart' and event_date = '2026-09-18') then
    insert into public.projects
      (title, event_date, month, project_type, status, offer_amount, budget_total, amount_paid, amount_remaining, payments_json)
    values
      ('Marianthi & Lennart', '2026-09-18', '2026-09', 'Wedding|photo,film', 'scheduled',
       2900, 2900, 600, 2300, '[{"date":"2026-02-20","amount":600}]'::jsonb)
    returning id into v_project;

    perform pg_temp.add_client(v_project, 'Marianthi', 'tangilim@gmail.com');
    perform pg_temp.add_client(v_project, 'Lennart', 'lennartbaks@gmail.com');
    perform pg_temp.add_crew(v_project, v_chris, 'photographer', 'inhouse');
    perform pg_temp.add_crew(v_project, v_vicky, 'videographer', 'freelancer');
    perform pg_temp.add_gallery(v_project, 'marianthi-lennart', 'Marianthi & Lennart');
  end if;

  -- ----- 9. Elli & Giorgos ------------------------------------------------
  if not exists (select 1 from public.projects where title = 'Elli & Giorgos' and event_date = '2026-09-19') then
    insert into public.projects
      (title, event_date, month, project_type, status, offer_amount, budget_total, amount_paid, amount_remaining, payments_json)
    values
      ('Elli & Giorgos', '2026-09-19', '2026-09', 'Wedding|photo,film', 'scheduled',
       2900, 2900, 0, 2900, '[]'::jsonb)
    returning id into v_project;

    perform pg_temp.add_crew(v_project, v_ares, 'videographer', 'inhouse');
    perform pg_temp.add_crew(v_project, v_stathis, 'photographer', 'freelancer');
    perform pg_temp.add_gallery(v_project, 'elli-giorgos', 'Elli & Giorgos');
  end if;

  -- ----- 10. Vasilis & Zacharoula (film only) -----------------------------
  if not exists (select 1 from public.projects where title = 'Vasilis & Zacharoula' and event_date = '2026-09-25') then
    insert into public.projects
      (title, event_date, month, project_type, status, offer_amount, budget_total, amount_paid, amount_remaining, payments_json)
    values
      ('Vasilis & Zacharoula', '2026-09-25', '2026-09', 'Wedding|film', 'scheduled',
       2000, 2000, 0, 2000, '[]'::jsonb)
    returning id into v_project;

    perform pg_temp.add_crew(v_project, v_ares, 'videographer', 'inhouse');
    perform pg_temp.add_gallery(v_project, 'vasilis-zacharoula', 'Vasilis & Zacharoula');
  end if;

  -- ----- 11. Γιώργος & Μαρία ----------------------------------------------
  if not exists (select 1 from public.projects where title = 'Γιώργος & Μαρία' and event_date = '2026-09-27') then
    insert into public.projects
      (title, event_date, month, project_type, status, offer_amount, budget_total, amount_paid, amount_remaining, payments_json)
    values
      ('Γιώργος & Μαρία', '2026-09-27', '2026-09', 'Wedding|photo,film', 'scheduled',
       3000, 3000, 900, 2100, '[{"date":"2026-02-25","amount":900}]'::jsonb)
    returning id into v_project;

    perform pg_temp.add_client(v_project, 'Γιώργος Πατράλης', 'gpatralis33@icloud.com');
    perform pg_temp.add_crew(v_project, v_ares, 'videographer', 'inhouse');
    perform pg_temp.add_crew(v_project, v_chris, 'photographer', 'inhouse');
    perform pg_temp.add_gallery(v_project, 'wedding', 'Γιώργος & Μαρία');
  end if;

  -- ----- 12. Eleni & Evripidis --------------------------------------------
  if not exists (select 1 from public.projects where title = 'Eleni & Evripidis' and event_date = '2026-10-17') then
    insert into public.projects
      (title, event_date, month, project_type, status, offer_amount, budget_total, amount_paid, amount_remaining, payments_json)
    values
      ('Eleni & Evripidis', '2026-10-17', '2026-10', 'Wedding|photo,film', 'scheduled',
       3400, 3400, 1000, 2400, '[{"date":"2026-04-17","amount":1000}]'::jsonb)
    returning id into v_project;

    perform pg_temp.add_client(v_project, 'Ελένη Κολιντζίκη', 'kolintziki.e@gmail.com');
    perform pg_temp.add_crew(v_project, v_ares, 'videographer', 'inhouse');
    perform pg_temp.add_crew(v_project, v_chris, 'photographer', 'inhouse');
    perform pg_temp.add_crew(v_project, v_theofilos, 'photographer', 'freelancer');
    perform pg_temp.add_crew(v_project, v_vicky, 'videographer', 'freelancer');
    perform pg_temp.add_gallery(v_project, 'eleni-evripidis', 'Eleni & Evripidis');
  end if;
end $$;

-- 3) Quick verification.
select title, event_date, status, project_type, offer_amount, amount_paid, amount_remaining
from public.projects
where event_date >= '2026-01-01'
order by event_date;
