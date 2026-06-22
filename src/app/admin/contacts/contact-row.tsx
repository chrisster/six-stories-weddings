"use client";

import { useState } from "react";

import {
  deleteContactAction,
  deleteCrewMemberAction,
  updateContactAction,
  updateCrewMemberAction,
} from "./actions";
import type { Contact, CrewMember } from "@/lib/types";

const inputCls = "h-9 w-full rounded-lg border border-border bg-white px-3 text-sm";
const labelCls = "text-xs font-medium text-muted-foreground";

const clientBadge = "bg-sky-100 text-sky-700";
const crewBadge = "bg-amber-100 text-amber-700";

export function ClientContactRow({ contact }: { contact: Contact }) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <tr className="border-b border-border/70 last:border-b-0">
        <td className="px-4 py-3 font-medium">{contact.fullName}</td>
        <td className="px-4 py-3">
          <span className={`inline-block rounded px-2 py-0.5 text-xs ${clientBadge}`}>Client</span>
        </td>
        <td className="px-4 py-3 text-muted-foreground">{contact.email || "-"}</td>
        <td className="px-4 py-3 text-muted-foreground">{contact.notes || "-"}</td>
        <td className="px-4 py-3">
          <button
            onClick={() => setEditing((v) => !v)}
            className="h-8 rounded-lg border border-border px-2 text-xs hover:border-foreground/40"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        </td>
      </tr>
      {editing && (
        <tr className="border-b border-border/70 bg-muted/20">
          <td colSpan={5} className="px-4 py-3">
            <form
              action={async (fd) => { await updateContactAction(fd); setEditing(false); }}
              className="grid gap-3 sm:grid-cols-4"
            >
              <input type="hidden" name="contactId" value={contact.id} />
              <div className="space-y-1">
                <label className={labelCls}>Name *</label>
                <input name="fullName" required defaultValue={contact.fullName} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Email</label>
                <input name="email" type="email" defaultValue={contact.email || ""} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Phone</label>
                <input name="phone" defaultValue={contact.phone || ""} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Notes</label>
                <input name="notes" defaultValue={contact.notes || ""} className={inputCls} />
              </div>
              <div className="flex gap-2 sm:col-span-4">
                <button type="submit" className="h-8 rounded-lg border border-foreground bg-foreground px-3 text-xs text-background">
                  Save
                </button>
                <button
                  type="submit"
                  form={`del-c-${contact.id}`}
                  className="h-8 rounded-lg border border-red-200 px-3 text-xs text-red-600 hover:border-red-400"
                >
                  Delete
                </button>
              </div>
            </form>
            <form id={`del-c-${contact.id}`} action={deleteContactAction}>
              <input type="hidden" name="contactId" value={contact.id} />
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

export function CrewContactRow({ member }: { member: CrewMember }) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <tr className="border-b border-border/70 last:border-b-0">
        <td className="px-4 py-3 font-medium">{member.fullName}</td>
        <td className="px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className={`inline-block rounded px-2 py-0.5 text-xs ${crewBadge}`}>Crew</span>
            <span className="text-xs capitalize text-muted-foreground">{member.roleType}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-muted-foreground">{member.contactInfo || "-"}</td>
        <td className="px-4 py-3 text-muted-foreground">-</td>
        <td className="px-4 py-3">
          <button
            onClick={() => setEditing((v) => !v)}
            className="h-8 rounded-lg border border-border px-2 text-xs hover:border-foreground/40"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        </td>
      </tr>
      {editing && (
        <tr className="border-b border-border/70 bg-muted/20">
          <td colSpan={5} className="px-4 py-3">
            <form
              action={async (fd) => { await updateCrewMemberAction(fd); setEditing(false); }}
              className="grid gap-3 sm:grid-cols-4"
            >
              <input type="hidden" name="crewMemberId" value={member.id} />
              <div className="space-y-1">
                <label className={labelCls}>Name *</label>
                <input name="fullName" required defaultValue={member.fullName} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Role</label>
                <select name="roleType" defaultValue={member.roleType} className={inputCls}>
                  <option value="photographer">Photographer</option>
                  <option value="videographer">Videographer</option>
                  <option value="editor">Editor</option>
                  <option value="assistant">Assistant</option>
                  <option value="partner">Partner</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Email</label>
                <input name="email" type="email" defaultValue={member.contactInfo || ""} className={inputCls} />
              </div>
              <div className="flex gap-2 sm:col-span-4">
                <button type="submit" className="h-8 rounded-lg border border-foreground bg-foreground px-3 text-xs text-background">
                  Save
                </button>
                <button
                  type="submit"
                  form={`del-cr-${member.id}`}
                  className="h-8 rounded-lg border border-red-200 px-3 text-xs text-red-600 hover:border-red-400"
                >
                  Remove
                </button>
              </div>
            </form>
            <form id={`del-cr-${member.id}`} action={deleteCrewMemberAction}>
              <input type="hidden" name="crewMemberId" value={member.id} />
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
