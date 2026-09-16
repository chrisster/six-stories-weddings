"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, PencilLine, Plus, RotateCcw, Trash2 } from "lucide-react";

import { sendContractAction } from "@/app/admin/contracts/actions";
import { ContractBody } from "@/components/contracts/contract-body";
import { formatContractDateFromIso, normalizeLanguage } from "@/lib/contract-i18n";
import {
  applyWordingOverride,
  buildPreviewValues,
  renderContract,
  wordingDiffers,
  type ContractClause,
  type ContractMergeData,
  type ContractSigner,
  type ContractTemplateSnapshot,
  type ContractWordingOverride,
} from "@/lib/contracts";

export type ComposerClient = { id: string; fullName: string; email: string | null };

export type ComposerProject = {
  id: string;
  title: string;
  eventDate: string | null;
  clients: ComposerClient[];
};

export type ComposerTemplate = {
  id: string;
  isActive: boolean;
  snapshot: ContractTemplateSnapshot;
};

/** Studio-side merge values; project title and date come from the project. */
export type ComposerStudio = Omit<ContractMergeData, "projectTitle" | "eventDate">;

const OTHER = "__other__";

const fieldClass =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-foreground/40";
const areaClass =
  "w-full rounded-xl border border-border bg-white px-3 py-2 font-mono text-[13px] leading-relaxed outline-none transition focus:border-foreground/40";
const labelClass = "mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground";
const chipButtonClass =
  "inline-flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-xs transition hover:border-foreground/40";

const LANGUAGE_LABELS: Record<string, string> = { el: "Ελληνικά", en: "English" };

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

function withEmail(clients: ComposerClient[]): ComposerClient[] {
  return clients.filter((client) => Boolean(client.email));
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {pending ? "Sending…" : "Send for signature"}
    </button>
  );
}

/**
 * The "send a contract" form. Used from the contracts page (with a project
 * picker) and from a project's own page (project fixed). Picks a signer from
 * the project's clients, lets the rest be CC'd, and shows the contract as the
 * client will see it, with the wording editable for this one send.
 */
export function ContractComposer({
  projects,
  fixedProjectId,
  templates,
  studio,
  studioCcEmail,
  emailReady,
  returnTo,
}: {
  projects: ComposerProject[];
  /** When set, the project cannot be changed and no picker is shown. */
  fixedProjectId?: string;
  templates: ComposerTemplate[];
  studio: ComposerStudio;
  studioCcEmail: string;
  emailReady: boolean;
  /** Admin path to land on after sending; the contracts page when omitted. */
  returnTo?: string;
}) {
  const initialProject = fixedProjectId
    ? projects.find((project) => project.id === fixedProjectId) ?? null
    : null;

  const [projectId, setProjectId] = useState(initialProject?.id ?? "");
  const project = projects.find((candidate) => candidate.id === projectId) ?? null;
  const signable = withEmail(project?.clients ?? []);

  const [templateId, setTemplateId] = useState(
    templates.find((template) => template.isActive)?.id ?? templates[0]?.id ?? "",
  );
  const template = templates.find((candidate) => candidate.id === templateId) ?? templates[0] ?? null;

  const [signerId, setSignerId] = useState<string>(signable[0]?.id ?? OTHER);
  const [recipientName, setRecipientName] = useState(signable[0]?.fullName ?? "");
  const [recipientEmail, setRecipientEmail] = useState(signable[0]?.email ?? "");
  const [ccIds, setCcIds] = useState<string[]>(signable.slice(1).map((client) => client.id));
  const [ccExtra, setCcExtra] = useState("");

  const [wording, setWording] = useState<ContractWordingOverride | null>(null);
  const [editing, setEditing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // --- Selection helpers ----------------------------------------------------

  /** Defaults for a project: first client signs, the others are CC'd. */
  const applyProjectDefaults = (next: ComposerProject | null) => {
    const clients = withEmail(next?.clients ?? []);
    const first = clients[0] ?? null;
    setSignerId(first?.id ?? OTHER);
    setRecipientName(first?.fullName ?? "");
    setRecipientEmail(first?.email ?? "");
    setCcIds(clients.slice(1).map((client) => client.id));
  };

  const handleProjectChange = (nextId: string) => {
    setProjectId(nextId);
    applyProjectDefaults(projects.find((candidate) => candidate.id === nextId) ?? null);
  };

  /**
   * The signer's own details prefill from the client card but stay editable.
   * Everyone else on the project goes back to being CC'd, the same default as
   * when the form opened.
   */
  const handleSignerChange = (nextId: string) => {
    setSignerId(nextId);
    const client = signable.find((candidate) => candidate.id === nextId) ?? null;
    setRecipientName(client?.fullName ?? "");
    setRecipientEmail(client?.email ?? "");
    setCcIds(signable.filter((candidate) => candidate.id !== nextId).map((candidate) => candidate.id));
  };

  const toggleCc = (id: string) => {
    setCcIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  };

  const handleTemplateChange = (nextId: string) => {
    if (
      wording &&
      template &&
      wordingDiffers(template.snapshot, wording) &&
      !window.confirm("Changing the template discards the wording edits for this contract. Continue?")
    ) {
      return;
    }
    setTemplateId(nextId);
    setWording(null);
    setEditing(false);
  };

  // --- Wording ---------------------------------------------------------------

  const startEditing = () => {
    if (!template) return;
    if (!wording) {
      setWording({
        title: template.snapshot.title,
        intro: template.snapshot.intro,
        clauses: template.snapshot.clauses.map((clause) => ({ ...clause })),
        closing: template.snapshot.closing,
      });
    }
    setEditing(true);
  };

  const resetWording = () => {
    setWording(null);
    setEditing(false);
  };

  const patchWording = (patch: Partial<ContractWordingOverride>) => {
    setWording((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const updateClause = (index: number, patch: Partial<ContractClause>) => {
    setWording((prev) =>
      prev
        ? {
            ...prev,
            clauses: prev.clauses.map((clause, i) => (i === index ? { ...clause, ...patch } : clause)),
          }
        : prev,
    );
  };

  const moveClause = (index: number, delta: number) => {
    setWording((prev) => {
      if (!prev) return prev;
      const target = index + delta;
      if (target < 0 || target >= prev.clauses.length) return prev;
      const clauses = [...prev.clauses];
      [clauses[index], clauses[target]] = [clauses[target], clauses[index]];
      return { ...prev, clauses };
    });
  };

  const removeClause = (index: number) => {
    setWording((prev) =>
      prev ? { ...prev, clauses: prev.clauses.filter((_, i) => i !== index) } : prev,
    );
  };

  const addClause = () => {
    setWording((prev) =>
      prev ? { ...prev, clauses: [...prev.clauses, { heading: "", body: "" }] } : prev,
    );
  };

  const edited = Boolean(template && wording && wordingDiffers(template.snapshot, wording));

  // --- Preview ---------------------------------------------------------------

  const language = normalizeLanguage(template?.snapshot.language);

  // Rendered only while the preview is open; the React Compiler memoizes it.
  const preview = template && showPreview ? buildPreview() : null;

  function buildPreview() {
    if (!template) return null;
    const applied = applyWordingOverride(template.snapshot, wording);
    const snapshot = applied.ok ? applied.snapshot : template.snapshot;

    const merge: ContractMergeData = {
      ...studio,
      projectTitle: project?.title ?? "",
      eventDate: formatContractDateFromIso(project?.eventDate, language),
    };

    // The signer fills in address and ΑΦΜ when signing; the name is known now,
    // so the counterparty sentence reads with it instead of dots.
    const name = splitName(recipientName);
    const signer: ContractSigner | null = name.firstName
      ? {
          ...name,
          city: "",
          street: "",
          isCompany: false,
          companyName: "",
          vatId: "",
          taxOffice: "",
        }
      : null;

    return renderContract(snapshot, buildPreviewValues(merge, signer, null, language));
  }

  const ccChoices = signable.filter((client) => client.id !== signerId);
  const ccEmailsSelected = ccChoices
    .filter((client) => ccIds.includes(client.id))
    .map((client) => client.email as string);
  const withoutEmail = (project?.clients ?? []).filter((client) => !client.email);

  if (!template) {
    return (
      <p className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        No contract template found. Run <code className="text-xs">npm run seed:contract-template</code>{" "}
        to load the defaults.
      </p>
    );
  }

  return (
    <form action={sendContractAction} className="space-y-5">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="templateId" value={template.id} />
      <input type="hidden" name="wording" value={edited && wording ? JSON.stringify(wording) : ""} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {ccEmailsSelected.map((email) => (
        <input key={email} type="hidden" name="ccEmails" value={email} />
      ))}

      {/* --- Project + template ---------------------------------------------- */}
      <div className={fixedProjectId ? "" : "grid gap-4 sm:grid-cols-2"}>
        {!fixedProjectId ? (
          <div>
            <label className={labelClass} htmlFor="composer-project">
              Project
            </label>
            <select
              id="composer-project"
              value={projectId}
              onChange={(event) => handleProjectChange(event.target.value)}
              className={fieldClass}
            >
              <option value="">— No project (standalone contract) —</option>
              {projects.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Linking a project flips it to <span className="font-medium">confirmed</span> once
              signed.
            </p>
          </div>
        ) : null}

        <div>
          <label className={labelClass} htmlFor="composer-template">
            Contract template
          </label>
          <select
            id="composer-template"
            value={template.id}
            onChange={(event) => handleTemplateChange(event.target.value)}
            className={fieldClass}
          >
            {templates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.snapshot.name} —{" "}
                {LANGUAGE_LABELS[candidate.snapshot.language] ?? candidate.snapshot.language}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-muted-foreground">
            The template&rsquo;s language also sets the language of the signing page and the
            emails.
          </p>
        </div>
      </div>

      {/* --- Who signs --------------------------------------------------------- */}
      <div className="grid gap-4 md:grid-cols-2">
        <fieldset className="rounded-xl border border-border/70 bg-white/70 p-3.5">
          <legend className="px-1 text-xs uppercase tracking-wide text-muted-foreground">
            Who signs
          </legend>

          {signable.length > 0 ? (
            <div className="space-y-1.5">
              {signable.map((client) => (
                <label
                  key={client.id}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-foreground/[0.03]"
                >
                  <input
                    type="radio"
                    name="signerChoice"
                    value={client.id}
                    checked={signerId === client.id}
                    onChange={() => handleSignerChange(client.id)}
                    className="mt-0.5 size-4 accent-neutral-800"
                  />
                  <span>
                    <span className="font-medium text-foreground">{client.fullName}</span>
                    <span className="block text-xs text-muted-foreground">{client.email}</span>
                  </span>
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-foreground/[0.03]">
                <input
                  type="radio"
                  name="signerChoice"
                  value={OTHER}
                  checked={signerId === OTHER}
                  onChange={() => handleSignerChange(OTHER)}
                  className="size-4 accent-neutral-800"
                />
                <span className="text-muted-foreground">Someone else</span>
              </label>
            </div>
          ) : (
            <p className="px-1 text-sm text-muted-foreground">
              {project
                ? "None of this project's clients has an email address yet. Type the signer below."
                : "Pick a project to choose from its clients, or type the signer below."}
            </p>
          )}

          <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="recipientName">
                Signer name
              </label>
              <input
                id="recipientName"
                name="recipientName"
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                className={fieldClass}
                placeholder="Μαρία Παπαδοπούλου"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="recipientEmail">
                Signer email
              </label>
              <input
                id="recipientEmail"
                name="recipientEmail"
                type="email"
                value={recipientEmail}
                onChange={(event) => setRecipientEmail(event.target.value)}
                className={fieldClass}
                required
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The signing link goes to this address. The signer confirms their name and fills in
            their address and ΑΦΜ on the signing page.
          </p>
        </fieldset>

        {/* --- Who is copied --------------------------------------------------- */}
        <fieldset className="rounded-xl border border-border/70 bg-white/70 p-3.5">
          <legend className="px-1 text-xs uppercase tracking-wide text-muted-foreground">
            Who is CC&rsquo;d
          </legend>

          {ccChoices.length > 0 ? (
            <div className="space-y-1.5">
              {ccChoices.map((client) => (
                <label
                  key={client.id}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-foreground/[0.03]"
                >
                  <input
                    type="checkbox"
                    checked={ccIds.includes(client.id)}
                    onChange={() => toggleCc(client.id)}
                    className="mt-0.5 size-4 accent-neutral-800"
                  />
                  <span>
                    <span className="font-medium text-foreground">{client.fullName}</span>
                    <span className="block text-xs text-muted-foreground">{client.email}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="px-1 text-sm text-muted-foreground">
              {project ? "No other client with an email on this project." : "No project selected."}
            </p>
          )}

          {withoutEmail.length > 0 ? (
            <p className="mt-2 px-1 text-xs text-muted-foreground">
              No email on file: {withoutEmail.map((client) => client.fullName).join(", ")}. Add
              one on the client card to include them.
            </p>
          ) : null}

          <div className="mt-3 border-t border-border/60 pt-3">
            <label className={labelClass} htmlFor="ccExtra">
              Also CC
            </label>
            <input
              id="ccExtra"
              name="ccExtra"
              value={ccExtra}
              onChange={(event) => setCcExtra(event.target.value)}
              className={fieldClass}
              placeholder="planner@example.com, parent@example.com"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            CC&rsquo;d people receive the invitation and the signed copy; only the signer signs.
            The studio copy always goes to{" "}
            <span className="font-medium text-foreground">{studioCcEmail}</span>.
          </p>
        </fieldset>
      </div>

      {/* --- Wording + preview ------------------------------------------------ */}
      <div className="rounded-xl border border-border/70 bg-white/70 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Wording</p>
          {edited ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              Edited for this contract
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">As in the template</span>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {editing ? (
              <button type="button" onClick={() => setEditing(false)} className={chipButtonClass}>
                Done editing
              </button>
            ) : (
              <button type="button" onClick={startEditing} className={chipButtonClass}>
                <PencilLine className="size-3.5" strokeWidth={1.8} />
                Edit wording
              </button>
            )}
            {edited ? (
              <button type="button" onClick={resetWording} className={chipButtonClass}>
                <RotateCcw className="size-3.5" strokeWidth={1.8} />
                Reset to template
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setShowPreview((value) => !value)}
              className={chipButtonClass}
            >
              {showPreview ? (
                <EyeOff className="size-3.5" strokeWidth={1.8} />
              ) : (
                <Eye className="size-3.5" strokeWidth={1.8} />
              )}
              {showPreview ? "Hide preview" : "Preview"}
            </button>
          </div>
        </div>

        {editing && wording ? (
          <div className="mt-4 space-y-4">
            <div>
              <label className={labelClass} htmlFor="wording-title">
                Contract title
              </label>
              <input
                id="wording-title"
                value={wording.title}
                onChange={(event) => patchWording({ title: event.target.value })}
                className={fieldClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="wording-intro">
                Preamble
              </label>
              <textarea
                id="wording-intro"
                value={wording.intro}
                onChange={(event) => patchWording({ intro: event.target.value })}
                rows={6}
                className={areaClass}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Blank line between paragraphs. Fields in double braces such as{" "}
                <code className="text-[11px]">{"{{client_party}}"}</code> are filled in when the
                client signs.
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className={labelClass.replace("mb-1.5 ", "")}>Clauses ({wording.clauses.length})</p>
                <button type="button" onClick={addClause} className={chipButtonClass}>
                  <Plus className="size-3.5" strokeWidth={1.8} />
                  Add clause
                </button>
              </div>
              <div className="space-y-3">
                {wording.clauses.map((clause, index) => (
                  <div key={index} className="rounded-xl border border-border/70 bg-white p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <input
                        value={clause.heading}
                        onChange={(event) => updateClause(index, { heading: event.target.value })}
                        placeholder="Heading"
                        className="h-9 flex-1 rounded-lg border border-border px-3 text-sm font-medium outline-none focus:border-foreground/40"
                      />
                      <button
                        type="button"
                        onClick={() => moveClause(index, -1)}
                        disabled={index === 0}
                        className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:border-foreground/40 hover:text-foreground disabled:opacity-30"
                        aria-label="Move clause up"
                      >
                        <ArrowUp className="size-3.5" strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveClause(index, 1)}
                        disabled={index === wording.clauses.length - 1}
                        className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:border-foreground/40 hover:text-foreground disabled:opacity-30"
                        aria-label="Move clause down"
                      >
                        <ArrowDown className="size-3.5" strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeClause(index)}
                        className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:border-red-300 hover:text-red-700"
                        aria-label="Remove clause"
                      >
                        <Trash2 className="size-3.5" strokeWidth={1.8} />
                      </button>
                    </div>
                    <textarea
                      value={clause.body}
                      onChange={(event) => updateClause(index, { body: event.target.value })}
                      rows={5}
                      placeholder="Clause text. Blank line between paragraphs."
                      className={areaClass}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="wording-closing">
                Closing line
              </label>
              <textarea
                id="wording-closing"
                value={wording.closing}
                onChange={(event) => patchWording({ closing: event.target.value })}
                rows={2}
                className={areaClass}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              These edits apply to this contract only. The template, its language and the consent
              sentence are unchanged; edit those under Organization → Contract wording.
            </p>
          </div>
        ) : null}

        {showPreview && preview ? (
          <div className="mt-4">
            <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-neutral-200 bg-[#fcfbfa] px-5 py-6 sm:px-7">
              <ContractBody rendered={preview} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              This is what the client sees on the signing page. Dotted fields are filled in from
              their details when they sign.
            </p>
          </div>
        ) : null}
      </div>

      {/* --- Send ------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={!recipientEmail.trim()} />
        <p className="text-xs text-muted-foreground">
          {emailReady
            ? "Emails the signing link now. The link works for 30 days."
            : "Email is not configured: the contract is created and the signing link must be copied by hand."}
        </p>
      </div>
    </form>
  );
}
