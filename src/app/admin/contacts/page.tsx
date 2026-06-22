import {
  convertContactToClientAction,
  createContactAction,
  createCrewMemberAction,
  deleteCrewMemberAction,
  updateContactStatusAction,
} from "@/app/admin/contacts/actions";
import { getContacts, getCrewMembers } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/env";

function currency(value: number | null | undefined) {
  if (value == null) {
    return "-";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const [contacts, crewMembers] = await Promise.all([getContacts(), getCrewMembers()]);

  return (
    <div className="space-y-6">
      <section className="soft-panel p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="title-cinematic text-2xl font-semibold">Contacts</h2>
          {!hasSupabaseEnv ? <p className="text-xs text-muted-foreground">Demo mode: changes are not persisted.</p> : null}
        </div>

        <details className="mt-1">
          <summary className="inline-flex cursor-pointer select-none items-center rounded-xl border border-border px-4 py-2 text-sm hover:border-foreground/40">+ Add contact</summary>
          <div className="mt-3">
            <form action={createContactAction} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <input name="fullName" required placeholder="Full name" className="h-10 rounded-xl border border-border bg-white px-3 text-sm" />
          <input name="email" type="email" placeholder="Email" className="h-10 rounded-xl border border-border bg-white px-3 text-sm" />
          <input name="phone" placeholder="Phone" className="h-10 rounded-xl border border-border bg-white px-3 text-sm" />
          <select name="status" defaultValue="lead" className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
            <option value="lead">Lead</option>
            <option value="offer_sent">Offer sent</option>
            <option value="confirmed">Confirmed</option>
            <option value="rejected">Rejected</option>
          </select>
          <input
            name="notes"
            placeholder="Notes"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm sm:col-span-2"
          />

          <button type="submit" className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background xl:justify-self-start">
            Add contact
          </button>
            </form>
          </div>
        </details>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-white/80">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Event date</th>
              <th className="px-4 py-3">Offer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id} className="border-b border-border/70 last:border-b-0">
                <td className="px-4 py-3 align-top font-medium">{contact.fullName}</td>
                <td className="px-4 py-3 align-top">{contact.eventDate || "-"}</td>
                <td className="px-4 py-3 align-top">{currency(contact.offerAmount)}</td>
                <td className="px-4 py-3 align-top capitalize">{contact.status.replace("_", " ")}</td>
                <td className="px-4 py-3 align-top">
                  <p>{contact.email || "-"}</p>
                  <p className="text-xs text-muted-foreground">{contact.phone || "-"}</p>
                </td>
                <td className="px-4 py-3 align-top text-muted-foreground">{contact.notes || "-"}</td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-wrap gap-2">
                    <form action={updateContactStatusAction}>
                      <input type="hidden" name="contactId" value={contact.id} />
                      <select
                        name="status"
                        defaultValue={contact.status}
                        className="h-8 rounded-lg border border-border bg-white px-2 text-xs"
                      >
                        <option value="lead">Lead</option>
                        <option value="offer_sent">Offer sent</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="rejected">Rejected</option>
                        <option value="converted">Converted</option>
                      </select>
                      <button type="submit" className="ml-1 h-8 rounded-lg border border-border px-2 text-xs">
                        Save
                      </button>
                    </form>

                    <form action={convertContactToClientAction}>
                      <input type="hidden" name="contactId" value={contact.id} />
                      <button
                        type="submit"
                        disabled={contact.status !== "confirmed" && contact.status !== "converted"}
                        className="h-8 rounded-lg border border-border px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Convert to client
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Crew Roster */}
      <section className="soft-panel p-5">
        <div className="mb-4">
          <h2 className="title-cinematic text-2xl font-semibold">Crew Roster</h2>
          <p className="mt-1 text-sm text-muted-foreground">Crew members available to assign to projects.</p>
        </div>

        <form action={createCrewMemberAction} className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <input name="fullName" required placeholder="Full name" className="h-10 rounded-xl border border-border bg-white px-3 text-sm" />
          <select name="roleType" defaultValue="photographer" className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
            <option value="photographer">Photographer</option>
            <option value="videographer">Videographer</option>
            <option value="editor">Editor</option>
            <option value="assistant">Assistant</option>
            <option value="partner">Partner</option>
          </select>
          <input name="email" type="email" placeholder="Email" className="h-10 rounded-xl border border-border bg-white px-3 text-sm" />
          <input name="phone" placeholder="Phone" className="h-10 rounded-xl border border-border bg-white px-3 text-sm" />
          <button type="submit" className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background xl:justify-self-start">
            Add crew member
          </button>
        </form>

        {crewMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No crew members yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-white/80">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {crewMembers.map((member) => (
                  <tr key={member.id} className="border-b border-border/70 last:border-b-0">
                    <td className="px-4 py-3 font-medium">{member.fullName}</td>
                    <td className="px-4 py-3 capitalize">{member.roleType}</td>
                    <td className="px-4 py-3 text-muted-foreground">{member.contactInfo || "-"}</td>
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
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
