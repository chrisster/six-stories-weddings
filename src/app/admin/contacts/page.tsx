import {
  convertContactToClientAction,
  createContactAction,
  createCrewMemberAction,
  deleteCrewMemberAction,
} from "@/app/admin/contacts/actions";
import { getContacts, getCrewMembers } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const statusBadge: Record<string, string> = {
  lead: "bg-zinc-100 text-zinc-600",
  offer_sent: "bg-sky-100 text-sky-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  converted: "bg-purple-100 text-purple-700",
  rejected: "bg-red-100 text-red-600",
};

const roleBadge = "bg-amber-100 text-amber-700";

export default async function ContactsPage() {
  const [contacts, crewMembers] = await Promise.all([getContacts(), getCrewMembers()]);

  return (
    <div className="space-y-6">
      <section className="soft-panel p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="title-cinematic text-2xl font-semibold">Contacts</h2>
          {!hasSupabaseEnv ? <p className="text-xs text-muted-foreground">Demo mode: changes are not persisted.</p> : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <details>
            <summary className="inline-flex cursor-pointer select-none items-center rounded-xl border border-border px-4 py-2 text-sm hover:border-foreground/40">+ Add contact</summary>
            <div className="mt-3">
              <form action={createContactAction} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Full Name *</label>
                  <input name="fullName" required placeholder="Full name" className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Email</label>
                  <input name="email" type="email" placeholder="Email" className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Phone</label>
                  <input name="phone" placeholder="Phone" className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Status</label>
                  <select name="status" defaultValue="lead" className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm">
                    <option value="lead">Lead</option>
                    <option value="offer_sent">Offer sent</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Notes</label>
                  <input name="notes" placeholder="Notes" className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm" />
                </div>
                <button type="submit" className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background xl:justify-self-start">
                  Add contact
                </button>
              </form>
            </div>
          </details>

          <details>
            <summary className="inline-flex cursor-pointer select-none items-center rounded-xl border border-border px-4 py-2 text-sm hover:border-foreground/40">+ Add crew member</summary>
            <div className="mt-3">
              <form action={createCrewMemberAction} className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Full Name *</label>
                  <input name="fullName" required placeholder="Full name" className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Role</label>
                  <select name="roleType" defaultValue="photographer" className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm">
                    <option value="photographer">Photographer</option>
                    <option value="videographer">Videographer</option>
                    <option value="editor">Editor</option>
                    <option value="assistant">Assistant</option>
                    <option value="partner">Partner</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Email</label>
                  <input name="email" type="email" placeholder="Email" className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm" />
                </div>
                <input type="hidden" name="phone" value="" />
                <button type="submit" className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background sm:justify-self-start">
                  Add crew member
                </button>
              </form>
            </div>
          </details>
        </div>
      </section>

      {/* Unified people table */}
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-white/80">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={`c-${contact.id}`} className="border-b border-border/70 last:border-b-0">
                <td className="px-4 py-3 font-medium">{contact.fullName}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs capitalize ${statusBadge[contact.status] || ""}`}>
                    {contact.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{contact.email || "-"}</td>
                <td className="px-4 py-3 text-muted-foreground">{contact.notes || "-"}</td>
                <td className="px-4 py-3">
                  <form action={convertContactToClientAction}>
                    <input type="hidden" name="contactId" value={contact.id} />
                    <button
                      type="submit"
                      disabled={contact.status !== "confirmed" && contact.status !== "converted"}
                      className="h-8 rounded-lg border border-border px-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Convert to client
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {crewMembers.map((member) => (
              <tr key={`cr-${member.id}`} className="border-b border-border/70 last:border-b-0">
                <td className="px-4 py-3 font-medium">{member.fullName}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs capitalize ${roleBadge}`}>
                    {member.roleType}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{member.contactInfo || "-"}</td>
                <td className="px-4 py-3 text-muted-foreground">-</td>
                <td className="px-4 py-3">
                  <form action={deleteCrewMemberAction}>
                    <input type="hidden" name="crewMemberId" value={member.id} />
                    <button type="submit" className="h-8 rounded-lg border border-red-200 px-2 text-xs text-red-600 hover:border-red-400">
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {contacts.length === 0 && crewMembers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">No people added yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
