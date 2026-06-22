"use client";

import { useState } from "react";
import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { createProjectAction } from "@/app/admin/projects/actions";
import type { Contact, CrewMember } from "@/lib/types";

type ServiceType = "photo" | "video";

type ClientEntry = {
  contactId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
};

type CrewEntry = {
  crewMemberId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  roleType: string;
  assignmentRole: string;
};

function emptyClient(): ClientEntry {
  return { contactId: "", firstName: "", lastName: "", email: "", phone: "", notes: "" };
}

function emptyCrew(): CrewEntry {
  return {
    crewMemberId: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    roleType: "photographer",
    assignmentRole: "",
  };
}

const inputCls =
  "h-10 w-full rounded-xl border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";
const labelCls = "text-xs font-medium tracking-wide text-muted-foreground uppercase";

export function NewWeddingForm({
  contacts,
  crewMembers,
}: {
  contacts: Contact[];
  crewMembers: CrewMember[];
}) {
  const [services, setServices] = useState<ServiceType[]>(["photo", "video"]);
  const [clients, setClients] = useState<ClientEntry[]>([emptyClient()]);
  const [crew, setCrew] = useState<CrewEntry[]>([]);

  function toggleService(svc: ServiceType) {
    setServices((prev) =>
      prev.includes(svc) ? prev.filter((s) => s !== svc) : [...prev, svc],
    );
  }

  function updateClient(idx: number, field: keyof ClientEntry, value: string) {
    setClients((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  }

  function selectExistingContact(idx: number, contactId: string) {
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) {
      setClients((prev) => prev.map((c, i) => (i === idx ? emptyClient() : c)));
      return;
    }
    const parts = contact.fullName.split(" ");
    setClients((prev) =>
      prev.map((c, i) =>
        i === idx
          ? {
              contactId,
              firstName: parts[0] || "",
              lastName: parts.slice(1).join(" ") || "",
              email: contact.email || "",
              phone: contact.phone || "",
              notes: contact.notes || "",
            }
          : c,
      ),
    );
  }

  function updateCrew(idx: number, field: keyof CrewEntry, value: string) {
    setCrew((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  }

  function selectExistingCrew(idx: number, crewMemberId: string) {
    const member = crewMembers.find((m) => m.id === crewMemberId);
    if (!member) {
      setCrew((prev) => prev.map((c, i) => (i === idx ? emptyCrew() : c)));
      return;
    }
    const parts = member.fullName.split(" ");
    const roleMap: Record<string, string> = {
      photographer: "Photographer",
      videographer: "Videographer",
      editor: "Editor",
      assistant: "Assistant",
    };
    setCrew((prev) =>
      prev.map((c, i) =>
        i === idx
          ? {
              crewMemberId,
              firstName: parts[0] || "",
              lastName: parts.slice(1).join(" ") || "",
              email: "",
              phone: "",
              roleType: member.roleType,
              assignmentRole: roleMap[member.roleType] || "",
            }
          : c,
      ),
    );
  }

  return (
    <form action={createProjectAction} className="space-y-6">
      {/* Serialized dynamic data */}
      <input type="hidden" name="services" value={services.join(",")} />
      <input type="hidden" name="clientsData" value={JSON.stringify(clients)} />
      <input type="hidden" name="crewData" value={JSON.stringify(crew)} />

      {/* ── Section 1: Project ───────────────────────────────────── */}
      <section className="soft-panel space-y-4 p-5">
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">01 — Project</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className={labelCls}>Title *</label>
            <input
              name="title"
              required
              placeholder="e.g. Joost & Stav Wedding"
              className={inputCls}
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Event Date *</label>
            <input name="eventDate" type="date" required className={inputCls} />
          </div>
        </div>

        <div className="space-y-1">
          <label className={labelCls}>Services</label>
          <div className="flex gap-2">
            {(["photo", "video"] as ServiceType[]).map((svc) => (
              <button
                key={svc}
                type="button"
                onClick={() => toggleService(svc)}
                className={`rounded-xl border px-5 py-2.5 text-sm font-medium transition ${
                  services.includes(svc)
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-white hover:border-foreground/30"
                }`}
              >
                {svc === "photo" ? "Photography" : "Videography"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className={labelCls}>Budget (€)</label>
            <input
              name="budgetTotal"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
              placeholder="e.g. 3500"
              className={inputCls}
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Amount Paid (€)</label>
            <input
              name="amountPaid"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
              placeholder="e.g. 1000"
              className={inputCls}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className={labelCls}>Notes</label>
          <textarea
            name="notes"
            rows={3}
            placeholder="Venue details, special requests…"
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>
      </section>

      {/* ── Section 2: Clients ───────────────────────────────────── */}
      <section className="soft-panel space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">02 — Clients</p>
          <button
            type="button"
            onClick={() => setClients((prev) => [...prev, emptyClient()])}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs hover:border-foreground/30"
          >
            <PlusIcon className="size-3" /> Add person
          </button>
        </div>

        {clients.map((client, idx) => (
          <div key={idx} className="space-y-3 rounded-xl border border-border/70 bg-white/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted-foreground">Person {idx + 1}</p>
              {clients.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setClients((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-xs text-destructive"
                >
                  Remove
                </button>
              ) : null}
            </div>

            {contacts.length > 0 ? (
              <div className="space-y-1">
                <label className={labelCls}>Import from contacts</label>
                <select
                  className={inputCls}
                  value={client.contactId}
                  onChange={(e) => selectExistingContact(idx, e.target.value)}
                >
                  <option value="">— Select existing contact —</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                      {c.email ? ` (${c.email})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={labelCls}>First Name</label>
                <input
                  className={inputCls}
                  value={client.firstName}
                  onChange={(e) => updateClient(idx, "firstName", e.target.value)}
                  placeholder="First name"
                />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Last Name</label>
                <input
                  className={inputCls}
                  value={client.lastName}
                  onChange={(e) => updateClient(idx, "lastName", e.target.value)}
                  placeholder="Last name"
                />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Email</label>
                <input
                  type="email"
                  className={inputCls}
                  value={client.email}
                  onChange={(e) => updateClient(idx, "email", e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Phone</label>
                <input
                  className={inputCls}
                  value={client.phone}
                  onChange={(e) => updateClient(idx, "phone", e.target.value)}
                  placeholder="+30 69..."
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className={labelCls}>Notes</label>
              <input
                className={inputCls}
                value={client.notes}
                onChange={(e) => updateClient(idx, "notes", e.target.value)}
                placeholder="Notes about this person"
              />
            </div>
          </div>
        ))}
      </section>

      {/* ── Section 3: Crew ──────────────────────────────────────── */}
      <section className="soft-panel space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">03 — Crew</p>
          <button
            type="button"
            onClick={() => setCrew((prev) => [...prev, emptyCrew()])}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs hover:border-foreground/30"
          >
            <PlusIcon className="size-3" /> Add crew member
          </button>
        </div>

        {crew.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No crew assigned yet. Click &ldquo;Add crew member&rdquo; to assign someone.
          </p>
        ) : null}

        {crew.map((member, idx) => (
          <div key={idx} className="space-y-3 rounded-xl border border-border/70 bg-white/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted-foreground">Crew {idx + 1}</p>
              <button
                type="button"
                onClick={() => setCrew((prev) => prev.filter((_, i) => i !== idx))}
                className="text-xs text-destructive"
              >
                Remove
              </button>
            </div>

            {crewMembers.length > 0 ? (
              <div className="space-y-1">
                <label className={labelCls}>Select existing crew</label>
                <select
                  className={inputCls}
                  value={member.crewMemberId}
                  onChange={(e) => selectExistingCrew(idx, e.target.value)}
                >
                  <option value="">— Add new crew member —</option>
                  {crewMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName} ({m.roleType})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={labelCls}>First Name</label>
                <input
                  className={inputCls}
                  value={member.firstName}
                  onChange={(e) => updateCrew(idx, "firstName", e.target.value)}
                  placeholder="First name"
                />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Last Name</label>
                <input
                  className={inputCls}
                  value={member.lastName}
                  onChange={(e) => updateCrew(idx, "lastName", e.target.value)}
                  placeholder="Last name"
                />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Email</label>
                <input
                  type="email"
                  className={inputCls}
                  value={member.email}
                  onChange={(e) => updateCrew(idx, "email", e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Phone</label>
                <input
                  className={inputCls}
                  value={member.phone}
                  onChange={(e) => updateCrew(idx, "phone", e.target.value)}
                  placeholder="+30 69..."
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={labelCls}>Role</label>
                <select
                  className={inputCls}
                  value={member.roleType}
                  onChange={(e) => updateCrew(idx, "roleType", e.target.value)}
                >
                  <option value="photographer">Photographer</option>
                  <option value="videographer">Videographer</option>
                  <option value="editor">Editor</option>
                  <option value="assistant">Assistant</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Assignment Title</label>
                <input
                  className={inputCls}
                  value={member.assignmentRole}
                  onChange={(e) => updateCrew(idx, "assignmentRole", e.target.value)}
                  placeholder="e.g. Lead Photographer"
                />
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="h-11 rounded-xl border border-foreground bg-foreground px-6 text-sm font-medium text-background"
        >
          Create Wedding
        </button>
        <Link
          href="/admin"
          className="h-11 rounded-xl border border-border px-6 py-2.5 text-sm"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
