"use client";

import { useState } from "react";

import { addClientToProjectAction } from "@/app/admin/projects/actions";
import type { Contact } from "@/lib/types";

export function AddClientForm({ projectId, contacts }: { projectId: string; contacts: Contact[] }) {
  const [contactId, setContactId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  function selectContact(id: string) {
    setContactId(id);
    const contact = contacts.find((entry) => entry.id === id);
    if (!contact) {
      setFullName("");
      setEmail("");
      setPhone("");
      return;
    }
    setFullName(contact.fullName);
    setEmail(contact.email || "");
    setPhone(contact.phone || "");
  }

  return (
    <details>
      <summary className="cursor-pointer list-none rounded-xl border border-foreground bg-foreground px-3 py-2 text-sm text-background">
        Add client
      </summary>
      <div className="mt-3 rounded-xl border border-border bg-white p-3">
        <form action={addClientToProjectAction} className="grid gap-2 sm:grid-cols-3">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="contactId" value={contactId} />
          {contacts.length > 0 ? (
            <select
              value={contactId}
              onChange={(event) => selectContact(event.target.value)}
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm sm:col-span-3"
            >
              <option value="">— Select from contacts or type below —</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.fullName}
                  {contact.email ? ` (${contact.email})` : ""}
                </option>
              ))}
            </select>
          ) : null}
          <input
            name="fullName"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Full name"
            required
            className="h-10 rounded-xl border border-border px-3 text-sm"
          />
          <input
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            className="h-10 rounded-xl border border-border px-3 text-sm"
          />
          <input
            name="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Phone"
            className="h-10 rounded-xl border border-border px-3 text-sm"
          />
          <button
            type="submit"
            className="h-10 rounded-xl border border-foreground bg-foreground px-3 text-sm text-background sm:col-span-3 sm:justify-self-start"
          >
            Add client
          </button>
        </form>
      </div>
    </details>
  );
}
