import { getContacts } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/env";

import { AddContactForm } from "./add-form";
import { ClientContactRow } from "./contact-row";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const contacts = await getContacts();

  return (
    <div className="space-y-6">
      <section className="soft-panel p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="title-cinematic text-2xl font-semibold">Contacts</h2>
          {!hasSupabaseEnv ? <p className="text-xs text-muted-foreground">Demo mode: changes are not persisted.</p> : null}
        </div>

        <details>
          <summary className="inline-flex cursor-pointer select-none items-center rounded-xl border border-border px-4 py-2 text-sm hover:border-foreground/40">
            + Add contact
          </summary>
          <div className="mt-4">
            <AddContactForm />
          </div>
        </details>
      </section>

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
              <ClientContactRow key={`c-${contact.id}`} contact={contact} />
            ))}
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No contacts yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
