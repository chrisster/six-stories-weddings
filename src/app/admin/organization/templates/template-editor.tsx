"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import type { ContractClause, ContractTemplateSnapshot } from "@/lib/contracts";

import { saveTemplateAction } from "./actions";

const MERGE_FIELDS: { token: string; description: string }[] = [
  { token: "{{signed_date}}", description: "Date the client signs — stamped automatically" },
  { token: "{{place}}", description: "City of signing, from Organization settings" },
  { token: "{{client_party}}", description: "The whole counterparty sentence, built from the signer's details" },
  { token: "{{client_name}}", description: "Signer's name (or company name)" },
  { token: "{{client_city}}", description: "Signer's city" },
  { token: "{{client_street}}", description: "Signer's street and number" },
  { token: "{{client_vat_id}}", description: "Signer's ΑΦΜ / TIN" },
  { token: "{{studio_legal_name}}", description: "Studio legal name" },
  { token: "{{studio_city}}", description: "Studio city" },
  { token: "{{studio_address}}", description: "Studio street address" },
  { token: "{{studio_vat_id}}", description: "Studio ΑΦΜ" },
  { token: "{{studio_tax_office}}", description: "Studio Δ.Ο.Υ." },
  { token: "{{studio_representatives}}", description: "Studio legal representatives" },
  { token: "{{project_title}}", description: "Linked project title" },
  { token: "{{event_date}}", description: "Linked project event date" },
];

const inputCls =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-foreground/40";
const areaCls =
  "w-full rounded-xl border border-border bg-white px-3 py-2 font-mono text-[13px] leading-relaxed outline-none transition focus:border-foreground/40";
const labelCls = "mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground";

export function TemplateEditor({
  templateId,
  snapshot,
}: {
  templateId: string;
  snapshot: ContractTemplateSnapshot;
}) {
  const [clauses, setClauses] = useState<ContractClause[]>(snapshot.clauses);
  const [showFields, setShowFields] = useState(false);

  const updateClause = (index: number, patch: Partial<ContractClause>) => {
    setClauses((prev) => prev.map((clause, i) => (i === index ? { ...clause, ...patch } : clause)));
  };

  const move = (index: number, delta: number) => {
    setClauses((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const remove = (index: number) => setClauses((prev) => prev.filter((_, i) => i !== index));
  const add = () => setClauses((prev) => [...prev, { heading: "", body: "" }]);

  return (
    <form action={saveTemplateAction} className="space-y-5">
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="version" value={snapshot.version} />
      <input type="hidden" name="clauses" value={JSON.stringify(clauses)} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="name" className={labelCls}>Template name</label>
          <input id="name" name="name" defaultValue={snapshot.name} className={inputCls} required />
        </div>
        <div>
          <label htmlFor="language" className={labelCls}>Language</label>
          <select id="language" name="language" defaultValue={snapshot.language} className={inputCls}>
            <option value="el">Ελληνικά</option>
            <option value="en">English</option>
          </select>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Sets the language of the signing page, the emails, and the PDF labels.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="title" className={labelCls}>Contract title</label>
        <input id="title" name="title" defaultValue={snapshot.title} className={inputCls} required />
      </div>

      {/* --- Merge field reference ------------------------------------------ */}
      <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
        <button
          type="button"
          onClick={() => setShowFields((value) => !value)}
          className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
        >
          {showFields ? "Hide" : "Show"} available merge fields
        </button>
        {showFields ? (
          <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {MERGE_FIELDS.map((field) => (
              <div key={field.token} className="flex gap-2 text-xs">
                <dt className="shrink-0 font-mono text-foreground">{field.token}</dt>
                <dd className="text-muted-foreground">{field.description}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Anything in double braces is replaced when the contract is sent. An unknown field is left
            visible in the text rather than blanked, so typos are obvious.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="intro" className={labelCls}>Preamble</label>
        <textarea id="intro" name="intro" defaultValue={snapshot.intro} rows={8} className={areaCls} />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Blank line between paragraphs. This is where the two parties are named.
        </p>
      </div>

      {/* --- Clauses -------------------------------------------------------- */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className={labelCls}>Clauses ({clauses.length})</p>
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-xs transition hover:border-foreground/40"
          >
            <Plus className="size-3.5" strokeWidth={1.8} />
            Add clause
          </button>
        </div>

        <div className="space-y-3">
          {clauses.map((clause, index) => (
            <div key={index} className="rounded-xl border border-border/70 bg-white p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  value={clause.heading}
                  onChange={(event) => updateClause(index, { heading: event.target.value })}
                  placeholder="Heading — e.g. ΥΠΗΡΕΣΙΕΣ"
                  className="h-9 flex-1 rounded-lg border border-border px-3 text-sm font-medium outline-none focus:border-foreground/40"
                />
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0}
                  className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:border-foreground/40 hover:text-foreground disabled:opacity-30"
                  aria-label="Move clause up">
                  <ArrowUp className="size-3.5" strokeWidth={1.8} />
                </button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === clauses.length - 1}
                  className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:border-foreground/40 hover:text-foreground disabled:opacity-30"
                  aria-label="Move clause down">
                  <ArrowDown className="size-3.5" strokeWidth={1.8} />
                </button>
                <button type="button" onClick={() => remove(index)}
                  className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:border-red-300 hover:text-red-700"
                  aria-label="Remove clause">
                  <Trash2 className="size-3.5" strokeWidth={1.8} />
                </button>
              </div>
              <textarea
                value={clause.body}
                onChange={(event) => updateClause(index, { body: event.target.value })}
                rows={7}
                placeholder="Clause text. Blank line between paragraphs."
                className={areaCls}
              />
            </div>
          ))}

          {clauses.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No clauses. Add one above.
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label htmlFor="closing" className={labelCls}>Closing line</label>
        <textarea id="closing" name="closing" defaultValue={snapshot.closing} rows={2} className={areaCls} />
      </div>

      <div>
        <label htmlFor="consentText" className={labelCls}>Consent wording</label>
        <textarea id="consentText" name="consentText" defaultValue={snapshot.consentText} rows={3} className={areaCls} />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Shown beside the tick box the client must accept, and recorded verbatim in the signed PDF as
          evidence of intent. Change it only with good reason.
        </p>
      </div>

      <div className="flex items-center gap-3 border-t border-border/70 pt-4">
        <button
          type="submit"
          className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition hover:opacity-90"
        >
          Save wording
        </button>
        <p className="text-xs text-muted-foreground">
          Saves in place. Contracts already sent or signed keep the wording they were issued with.
        </p>
      </div>
    </form>
  );
}
