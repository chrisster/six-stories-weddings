-- ---------------------------------------------------------------------------
-- Merge duplicate crew members created during the 2026 import into the
-- canonical records:
--   "Ares"  -> "Aristomenis"
--   "Vicky" -> "Vicky Kopaila"
--
-- Repoints every crew assignment / task to the canonical member, removes
-- duplicate assignments, then deletes the leftover duplicate crew member.
-- Safe to run multiple times.
-- ---------------------------------------------------------------------------
do $$
declare
  v_dup      uuid;
  v_keep     uuid;
  pair       record;
begin
  for pair in
    select * from (values
      ('Ares',  'Aristomenis'),
      ('Vicky', 'Vicky Kopaila')
    ) as t(dup_name, keep_name)
  loop
    select id into v_dup  from public.crew_members where full_name = pair.dup_name  order by created_at limit 1;
    select id into v_keep from public.crew_members where full_name = pair.keep_name order by created_at limit 1;

    if v_dup is null or v_keep is null or v_dup = v_keep then
      continue;
    end if;

    -- Repoint assignments and tasks.
    update public.crew_assignments set crew_member_id = v_keep where crew_member_id = v_dup;
    update public.project_tasks     set assignee_id   = v_keep where assignee_id   = v_dup;

    -- Drop duplicate assignments that now point the same person at the same
    -- project with the same role.
    delete from public.crew_assignments a
    using public.crew_assignments b
    where a.ctid > b.ctid
      and a.project_id = b.project_id
      and a.crew_member_id = b.crew_member_id
      and a.assignment_role = b.assignment_role;

    -- Remove the now-orphaned duplicate crew member.
    delete from public.crew_members where id = v_dup;
  end loop;
end $$;

-- Verification.
select full_name, role_type from public.crew_members order by full_name;
