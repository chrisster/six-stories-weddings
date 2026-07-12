import { requireAdminRole } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

import { createCrewLoginAction, removeCrewLoginAction } from "./actions";

type TeamPageProps = {
  searchParams: Promise<{ status?: string; reason?: string }>;
};

type CrewLogin = {
  id: string;
  authUserId: string | null;
  email: string;
  fullName: string | null;
  active: boolean;
};

async function getCrewLogins(): Promise<CrewLogin[]> {
  if (!hasSupabaseEnv) return [];
  const admin = createAdminClient();
  if (!admin) return [];

  const { data } = await admin
    .from("users")
    .select("id, auth_user_id, email, full_name, role, active")
    .eq("role", "crew")
    .order("email", { ascending: true });

  return (data || []).map((row) => ({
    id: String(row.id),
    authUserId: (row.auth_user_id as string | null) || null,
    email: String(row.email || ""),
    fullName: (row.full_name as string | null) || null,
    active: Boolean(row.active),
  }));
}

export default async function TeamPage({ searchParams }: TeamPageProps) {
  await requireAdminRole();
  const { status, reason } = await searchParams;
  const crew = await getCrewLogins();

  return (
    <div className="space-y-6">
      <section className="soft-panel p-5">
        <p className="text-xs tracking-[0.25em] text-muted-foreground uppercase">Studio</p>
        <h2 className="title-cinematic mt-2 text-3xl font-semibold">Team Access</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Create logins for crew members. Crew can manage projects, tasks, and galleries, but cannot
          see financials or client contacts.
        </p>
      </section>

      {status === "ok" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          Crew login created.
        </div>
      ) : null}
      {status === "removed" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Crew login removed.
        </div>
      ) : null}
      {status === "error" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {reason === "invalid"
            ? "Enter a valid email and a password of at least 8 characters."
            : reason === "unavailable"
              ? "Team management is unavailable."
              : `Could not create login: ${reason ? decodeURIComponent(reason) : "unknown error"}`}
        </div>
      ) : null}

      <section className="soft-panel p-5">
        <h3 className="mb-3 text-sm tracking-[0.2em] text-muted-foreground uppercase">Add crew login</h3>
        <form action={createCrewLoginAction} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <input
            name="fullName"
            placeholder="Full name"
            className="h-10 rounded-xl border border-border px-3 text-sm"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="Email"
            className="h-10 rounded-xl border border-border px-3 text-sm"
          />
          <input
            name="password"
            type="password"
            minLength={8}
            required
            placeholder="Temporary password (min 8)"
            className="h-10 rounded-xl border border-border px-3 text-sm"
          />
          <button
            type="submit"
            className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background"
          >
            Create login
          </button>
        </form>
      </section>

      <section className="soft-panel overflow-hidden p-0">
        <div className="border-b border-border/80 px-5 py-4">
          <h3 className="text-sm tracking-[0.2em] text-muted-foreground uppercase">Crew logins</h3>
        </div>
        {crew.length > 0 ? (
          <ul>
            {crew.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {member.fullName || member.email}
                  </p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>
                <form action={removeCrewLoginAction}>
                  <input type="hidden" name="userId" value={member.id} />
                  <input type="hidden" name="authUserId" value={member.authUserId || ""} />
                  <button
                    type="submit"
                    className="h-9 rounded-lg border border-red-200 px-3 text-xs text-red-600 hover:border-red-400"
                  >
                    Remove access
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-muted-foreground">No crew logins yet.</p>
        )}
      </section>
    </div>
  );
}
