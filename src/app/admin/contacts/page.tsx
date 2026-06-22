import {
  convertContactToClientAction,
  createContactAction,
  updateContactStatusAction,
} from "@/app/admin/contacts/actions";
import { getContacts } from "@/lib/data";
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

export default async function ContactsPage() {
  const contacts = await getContacts();

  return (
    <div className="space-y-6">
      <section className="soft-panel p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="title-cinematic text-2xl font-semibold">Contacts Pipeline</h2>
          {!hasSupabaseEnv ? <p className="text-xs text-muted-foreground">Demo mode: changes are not persisted.</p> : null}
        </div>

        <form action={createContactAction} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <input name="fullName" required placeholder="Full name" className="h-10 rounded-xl border border-border bg-white px-3 text-sm" />
          <input name="email" type="email" placeholder="Email" className="h-10 rounded-xl border border-border bg-white px-3 text-sm" />
          <input name="phone" placeholder="Phone" className="h-10 rounded-xl border border-border bg-white px-3 text-sm" />
          <input name="eventDate" type="date" className="h-10 rounded-xl border border-border bg-white px-3 text-sm" />

          <input
            name="offerAmount"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            placeholder="Offer amount"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />
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
    </div>
  );
}
