import { requireAdminRole } from "@/lib/auth";
import { getCrewMembers } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  createCrewAction,
  inviteCrewAction,
  removeCrewAction,
  setCrewAdminAccessAction,
  setCrewPasswordAction,
  updateCrewAction,
} from "./actions";

type TeamPageProps = {
  searchParams: Promise<{ status?: string; reason?: string }>;
};

async function getLoginRoleByEmail(): Promise<Record<string, string>> {
  if (!hasSupabaseEnv) return {};
  const admin = createAdminClient();
  if (!admin) return {};
  const { data } = await admin.from("users").select("email, role");
  const map: Record<string, string> = {};
  (data || []).forEach((row) => {
    const email = String(row.email || "").toLowerCase();
    if (email) map[email] = String(row.role || "");
  });
  return map;
}

export default async function TeamPage({ searchParams }: TeamPageProps) {
  await requireAdminRole();
  const { status, reason } = await searchParams;
  const [crew, roleByEmail] = await Promise.all([getCrewMembers(), getLoginRoleByEmail()]);

  return (
    <div className="space-y-6">
      <section className="soft-panel p-5">
        <p className="text-xs tracking-[0.25em] text-muted-foreground uppercase">Studio</p>
        <h2 className="title-cinematic mt-2 text-3xl font-semibold">Team</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage your crew and their specialties. Invite crew members to give them a login — they
          receive an email to set their own password. Crew can manage projects, tasks, and galleries,
          but never see financials or client contacts.
        </p>
      </section>

      {status === "created" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          Crew member added.
        </div>
      ) : null}
      {status === "updated" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          Crew member updated.
        </div>
      ) : null}
      {status === "invited" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          Invitation email sent. The crew member can set their password from the link.
        </div>
      ) : null}
      {status === "granted" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          Full admin access granted.
        </div>
      ) : null}
      {status === "revoked" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Admin access revoked — back to crew access.
        </div>
      ) : null}
      {status === "password_set" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          Password set. The crew member can sign in with it now.
        </div>
      ) : null}
      {status === "removed" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Crew member removed.
        </div>
      ) : null}
      {status === "error" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {reason === "invalid"
            ? "Enter a full name."
            : reason === "no_email"
              ? "Add a valid email address before inviting this crew member."
              : reason === "no_login"
                ? "Invite this crew member first so they have a login."
                : reason === "email_failed"
                  ? "The invite could not be emailed. Check email settings."
                  : reason === "weak_password"
                    ? "Use a password of at least 8 characters."
                    : reason === "unavailable"
                      ? "Team management is unavailable."
                      : `Something went wrong: ${reason ? decodeURIComponent(reason) : "unknown error"}`}
        </div>
      ) : null}

      <section className="soft-panel p-5">
        <h3 className="mb-3 text-sm tracking-[0.2em] text-muted-foreground uppercase">Add crew member</h3>
        <form action={createCrewAction} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <input
            name="fullName"
            required
            placeholder="Full name"
            className="h-10 rounded-xl border border-border px-3 text-sm"
          />
          <input
            name="email"
            type="email"
            placeholder="Email (for login invite)"
            className="h-10 rounded-xl border border-border px-3 text-sm"
          />
          <input
            name="phone"
            placeholder="Phone"
            className="h-10 rounded-xl border border-border px-3 text-sm"
          />
          <button
            type="submit"
            className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background"
          >
            Add crew member
          </button>
        </form>
      </section>

      <section className="soft-panel overflow-hidden p-0">
        <div className="border-b border-border/80 px-5 py-4">
          <h3 className="text-sm tracking-[0.2em] text-muted-foreground uppercase">Crew</h3>
        </div>
        {crew.length > 0 ? (
          <ul>
            {crew.map((member) => {
              const hasLogin = Boolean(member.authUserId);
              const loginRole = member.email ? roleByEmail[member.email.toLowerCase()] : undefined;
              const isAdmin = loginRole === "admin";
              return (
                <li
                  key={member.id}
                  className="border-b border-border/70 px-5 py-4 last:border-0"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{member.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {member.email || "No email"}
                        {member.phone ? ` · ${member.phone}` : ""}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${
                            hasLogin ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                          }`}
                        >
                          {hasLogin ? "Has login" : "No login yet"}
                        </span>
                        {isAdmin ? (
                          <span className="inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] text-indigo-700">
                            Full admin
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <form action={inviteCrewAction}>
                        <input type="hidden" name="crewMemberId" value={member.id} />
                        <button
                          type="submit"
                          className="h-9 rounded-lg border border-border px-3 text-xs hover:border-foreground/40"
                        >
                          {hasLogin ? "Resend set-password email" : "Invite (set password)"}
                        </button>
                      </form>

                      {hasLogin ? (
                        <form action={setCrewAdminAccessAction}>
                          <input type="hidden" name="crewMemberId" value={member.id} />
                          <input type="hidden" name="grant" value={isAdmin ? "false" : "true"} />
                          <button
                            type="submit"
                            className={`h-9 rounded-lg border px-3 text-xs ${
                              isAdmin
                                ? "border-amber-300 text-amber-700 hover:border-amber-400"
                                : "border-indigo-300 text-indigo-700 hover:border-indigo-400"
                            }`}
                          >
                            {isAdmin ? "Revoke admin" : "Grant full admin"}
                          </button>
                        </form>
                      ) : null}

                      <form action={removeCrewAction}>
                        <input type="hidden" name="crewMemberId" value={member.id} />
                        <input type="hidden" name="authUserId" value={member.authUserId || ""} />
                        <button
                          type="submit"
                          className="h-9 rounded-lg border border-red-200 px-3 text-xs text-red-600 hover:border-red-400"
                        >
                          Remove
                        </button>
                      </form>
                    </div>
                  </div>

                  <details className="mt-3">
                    <summary className="cursor-pointer list-none text-xs text-muted-foreground underline underline-offset-4">
                      Edit details
                    </summary>
                    <form action={updateCrewAction} className="mt-3 grid gap-2 sm:grid-cols-4">
                      <input type="hidden" name="crewMemberId" value={member.id} />
                      <input
                        name="fullName"
                        required
                        defaultValue={member.fullName}
                        className="h-10 rounded-xl border border-border px-3 text-sm"
                      />
                      <input
                        name="email"
                        type="email"
                        defaultValue={member.email || ""}
                        placeholder="Email"
                        className="h-10 rounded-xl border border-border px-3 text-sm"
                      />
                      <input
                        name="phone"
                        defaultValue={member.phone || ""}
                        placeholder="Phone"
                        className="h-10 rounded-xl border border-border px-3 text-sm"
                      />
                      <button
                        type="submit"
                        className="h-10 rounded-xl border border-border px-4 text-sm hover:border-foreground/30"
                      >
                        Save
                      </button>
                    </form>

                    <form
                      action={setCrewPasswordAction}
                      className="mt-3 grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-[1fr_auto]"
                    >
                      <input type="hidden" name="crewMemberId" value={member.id} />
                      <input
                        name="password"
                        type="password"
                        minLength={8}
                        required
                        placeholder="Set or reset password directly (min 8)"
                        className="h-10 rounded-xl border border-border px-3 text-sm"
                      />
                      <button
                        type="submit"
                        className="h-10 rounded-xl border border-border px-4 text-sm hover:border-foreground/30"
                      >
                        Set password
                      </button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-muted-foreground">No crew members yet.</p>
        )}
      </section>
    </div>
  );
}
