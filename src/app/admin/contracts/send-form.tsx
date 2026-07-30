"use client";

import { useState } from "react";

import { sendContractAction } from "./actions";

type ProjectOption = {
  id: string;
  title: string;
  clientEmail: string | null;
  clientName: string | null;
};

const fieldClass =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-foreground/40";
const labelClass = "mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground";

export function SendContractForm({ projects }: { projects: ProjectOption[] }) {
  const [projectId, setProjectId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  /**
   * Picking a project prefills the client's name and email, so the common case
   * is two clicks. Both stay editable — the signer is not always the contact on
   * file.
   */
  const handleProjectChange = (nextId: string) => {
    setProjectId(nextId);
    const project = projects.find((candidate) => candidate.id === nextId);
    if (!project) return;
    if (project.clientEmail) setEmail(project.clientEmail);
    if (project.clientName) setName(project.clientName);
  };

  return (
    <form action={sendContractAction} className="grid gap-4 sm:grid-cols-3">
      <div className="sm:col-span-3">
        <label className={labelClass} htmlFor="projectId">
          Project
        </label>
        <select
          id="projectId"
          name="projectId"
          value={projectId}
          onChange={(event) => handleProjectChange(event.target.value)}
          className={fieldClass}
        >
          <option value="">— No project (standalone contract) —</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Linking a project flips it to <span className="font-medium">confirmed</span> once signed.
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="recipientName">
          Client name
        </label>
        <input
          id="recipientName"
          name="recipientName"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={fieldClass}
          placeholder="Μαρία Παπαδοπούλου"
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="recipientEmail">
          Client email
        </label>
        <input
          id="recipientEmail"
          name="recipientEmail"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={fieldClass}
          required
        />
      </div>

      <div className="flex items-end">
        <button
          type="submit"
          className="w-full rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
        >
          Send for signature
        </button>
      </div>
    </form>
  );
}
