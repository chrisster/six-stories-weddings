import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
}

const supabase = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function upsertDemoData() {
  const passcodeHash = await bcrypt.hash("sixstories2026", 10);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .upsert(
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Joost & Stav Wedding",
        event_date: "2026-05-23",
        month: "MAY",
        project_type: "Wedding Photo + Video",
        referral: "Six Stories Studio",
        package_category: "Premium",
        status: "confirmed",
        editing_status: "in_progress",
        completed: false,
        budget_total: 3200,
        amount_paid: 1190.4,
        amount_remaining: 2009.6,
        notes: "Seeded demo project for app validation.",
      },
      { onConflict: "id" },
    )
    .select("id")
    .single();

  if (projectError || !project) {
    throw new Error(projectError?.message || "Could not create project.");
  }

  const clients = [
    {
      id: "22222222-2222-4222-8222-222222222221",
      full_name: "Joost",
      email: "joost@example.com",
      phone: "+30 6900000001",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      full_name: "Stav",
      email: "stav@example.com",
      phone: "+30 6900000002",
    },
  ];

  const { error: clientsError } = await supabase.from("clients").upsert(clients, { onConflict: "id" });
  if (clientsError) {
    throw new Error(clientsError.message);
  }

  const { error: projectClientsError } = await supabase.from("project_clients").upsert(
    [
      {
        id: "33333333-3333-4333-8333-333333333331",
        project_id: project.id,
        client_id: clients[0].id,
        role: "Partner",
      },
      {
        id: "33333333-3333-4333-8333-333333333332",
        project_id: project.id,
        client_id: clients[1].id,
        role: "Partner",
      },
    ],
    { onConflict: "id" },
  );

  if (projectClientsError) {
    throw new Error(projectClientsError.message);
  }

  const crew = [
    { id: "44444444-4444-4444-8444-444444444441", full_name: "Chris", role_type: "photographer" },
    { id: "44444444-4444-4444-8444-444444444442", full_name: "Ares", role_type: "videographer" },
    { id: "44444444-4444-4444-8444-444444444443", full_name: "Vicky", role_type: "editor" },
  ];

  const { error: crewError } = await supabase.from("crew_members").upsert(crew, { onConflict: "id" });
  if (crewError) {
    throw new Error(crewError.message);
  }

  const { error: assignmentsError } = await supabase.from("crew_assignments").upsert(
    [
      {
        id: "55555555-5555-4555-8555-555555555551",
        project_id: project.id,
        crew_member_id: crew[0].id,
        assignment_role: "Lead Photographer",
      },
      {
        id: "55555555-5555-4555-8555-555555555552",
        project_id: project.id,
        crew_member_id: crew[1].id,
        assignment_role: "Videographer",
      },
      {
        id: "55555555-5555-4555-8555-555555555553",
        project_id: project.id,
        crew_member_id: crew[2].id,
        assignment_role: "Editor",
      },
    ],
    { onConflict: "id" },
  );

  if (assignmentsError) {
    throw new Error(assignmentsError.message);
  }

  const { error: tasksError } = await supabase.from("project_tasks").upsert(
    [
      {
        id: "66666666-6666-4666-8666-666666666661",
        project_id: project.id,
        title: "Pre-wedding planning call",
        status: "done",
        priority: "medium",
      },
      {
        id: "66666666-6666-4666-8666-666666666662",
        project_id: project.id,
        title: "First photo cull",
        status: "in_progress",
        priority: "high",
      },
      {
        id: "66666666-6666-4666-8666-666666666663",
        project_id: project.id,
        title: "Highlight film draft",
        status: "todo",
        priority: "medium",
      },
    ],
    { onConflict: "id" },
  );

  if (tasksError) {
    throw new Error(tasksError.message);
  }

  const { error: deliverablesError } = await supabase.from("deliverables").upsert(
    [
      {
        id: "77777777-7777-4777-8777-777777777771",
        project_id: project.id,
        deliverable_type: "photos",
        status: "in_progress",
      },
      {
        id: "77777777-7777-4777-8777-777777777772",
        project_id: project.id,
        deliverable_type: "highlight_film",
        status: "pending",
      },
    ],
    { onConflict: "id" },
  );

  if (deliverablesError) {
    throw new Error(deliverablesError.message);
  }

  const { data: gallery, error: galleryError } = await supabase
    .from("galleries")
    .upsert(
      {
        id: "88888888-8888-4888-8888-888888888881",
        project_id: project.id,
        slug: "joost-stav-2026",
        title: "Joost & Stav",
        is_published: true,
        allow_downloads: false,
        passcode_hash: passcodeHash,
      },
      { onConflict: "id" },
    )
    .select("id")
    .single();

  if (galleryError || !gallery) {
    throw new Error(galleryError?.message || "Could not create gallery.");
  }

  const sections = [
    "Getting Ready",
    "Ceremony",
    "Couple Session",
    "Reception",
    "Party",
    "Films",
  ];

  const { error: sectionsError } = await supabase.from("gallery_sections").upsert(
    sections.map((name, index) => ({
      id: `99999999-9999-4999-8999-99999999999${index + 1}`,
      gallery_id: gallery.id,
      name,
      sort_order: index + 1,
    })),
    { onConflict: "id" },
  );

  if (sectionsError) {
    throw new Error(sectionsError.message);
  }

  console.log("Demo seed completed successfully.");
  console.log("Gallery slug: joost-stav-2026");
  console.log("Gallery passcode: sixstories2026");
}

upsertDemoData().catch((error) => {
  console.error(error);
  process.exit(1);
});