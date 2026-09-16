"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { resendContractAction, voidContractAction } from "@/app/admin/contracts/actions";
import {
  ContractComposer,
  type ComposerProject,
  type ComposerStudio,
  type ComposerTemplate,
} from "@/components/contracts/contract-composer";
import type { ContractStatus } from "@/lib/contracts";

/**
 * What the project page needs about a contract. A full ContractRecord carries
 * the frozen wording and the signature image, which have no place in the
 * page payload.
 */
export type ProjectContractSummary = {
  id: string;
  status: ContractStatus;
  title: string;
  recipientName: string | null;
  recipientEmail: string;
  ccEmails: string[];
  /** Most recent of signed / viewed / sent / created. */
  updatedAt: string;
  hasPdf: boolean;
  pdfSha256: string | null;
  voidReason: string | null;
};

const STATUS_STYLES: Record<ContractStatus, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  sent: "bg-blue-50 text-blue-700",
  viewed: "bg-amber-50 text-amber-800",
  signed: "bg-emerald-50 text-emerald-700",
  void: "bg-neutral-100 text-neutral-500 line-through",
};

const STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  void: "Void",
};

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ContractItem({ contract, returnTo }: { contract: ProjectContractSummary; returnTo: string }) {
  const [confirmingVoid, setConfirmingVoid] = useState(false);
  const canResend = contract.status === "sent" || contract.status === "viewed";
  const canVoid = contract.status !== "signed" && contract.status !== "void";

  return (
    <li className="border-b border-border/70 px-5 py-4 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              {contract.recipientName || contract.recipientEmail}
            </p>
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[contract.status]}`}
            >
              {STATUS_LABELS[contract.status]}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {contract.title} · {contract.recipientEmail}
          </p>
          {contract.ccEmails.length > 0 ? (
            <p className="mt-0.5 text-xs text-muted-foreground">cc {contract.ccEmails.join(", ")}</p>
          ) : null}
          {contract.status === "void" && contract.voidReason ? (
            <p className="mt-0.5 text-xs text-muted-foreground">Voided: {contract.voidReason}</p>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <p className="text-xs text-muted-foreground">{formatWhen(contract.updatedAt)}</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {contract.status === "signed" && contract.hasPdf ? (
              <a
                href={`/api/contracts/${contract.id}/pdf`}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs transition hover:border-foreground/40"
              >
                PDF
              </a>
            ) : null}

            {canResend ? (
              <form action={resendContractAction}>
                <input type="hidden" name="contractId" value={contract.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs transition hover:border-foreground/40"
                  title="Issues a new signing link and invalidates the old one"
                >
                  Resend
                </button>
              </form>
            ) : null}

            {canVoid ? (
              confirmingVoid ? (
                <form action={voidContractAction} className="flex items-center gap-1.5">
                  <input type="hidden" name="contractId" value={contract.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input
                    name="reason"
                    placeholder="Reason"
                    className="w-28 rounded-lg border border-border px-2 py-1.5 text-xs outline-none"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white"
                  >
                    Void
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingVoid(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingVoid(true)}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-red-300 hover:text-red-700"
                >
                  Void
                </button>
              )
            ) : null}
          </div>
          {contract.status === "signed" && contract.pdfSha256 ? (
            <p className="font-mono text-[10px] text-muted-foreground">
              {contract.pdfSha256.slice(0, 16)}…
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** The Contracts section of a project page: what was sent, and a way to send. */
export function ProjectContracts({
  project,
  contracts,
  templates,
  studio,
  studioCcEmail,
  emailReady,
  openComposer,
}: {
  project: ComposerProject;
  contracts: ProjectContractSummary[];
  templates: ComposerTemplate[];
  studio: ComposerStudio;
  studioCcEmail: string;
  emailReady: boolean;
  /** Start with the send form open, e.g. right after the project is created. */
  openComposer: boolean;
}) {
  const [composing, setComposing] = useState(openComposer || contracts.length === 0);
  const returnTo = `/admin/projects/${project.id}`;
  const signed = contracts.filter((contract) => contract.status === "signed").length;
  const pending = contracts.filter(
    (contract) => contract.status === "sent" || contract.status === "viewed",
  ).length;

  return (
    <section id="contracts" className="soft-panel overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 px-5 py-4">
        <div>
          <h3 className="text-sm tracking-[0.2em] text-muted-foreground uppercase">Contracts</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {contracts.length === 0
              ? "Nothing sent for this project yet."
              : `${pending} awaiting signature · ${signed} signed`}
            {" · "}
            <Link href="/admin/contracts" className="underline underline-offset-2">
              All contracts
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setComposing((value) => !value)}
          className={
            composing
              ? "rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground"
              : "inline-flex items-center gap-1.5 rounded-xl border border-foreground bg-foreground px-3 py-2 text-sm text-background"
          }
        >
          {composing ? (
            "Close"
          ) : (
            <>
              <Plus className="size-3.5" strokeWidth={2} />
              Send a contract
            </>
          )}
        </button>
      </div>

      {composing ? (
        <div className="border-b border-border/80 bg-zinc-50/70 px-5 py-5">
          <ContractComposer
            projects={[project]}
            fixedProjectId={project.id}
            templates={templates}
            studio={studio}
            studioCcEmail={studioCcEmail}
            emailReady={emailReady}
            returnTo={returnTo}
          />
        </div>
      ) : null}

      {contracts.length > 0 ? (
        <ul>
          {contracts.map((contract) => (
            <ContractItem key={contract.id} contract={contract} returnTo={returnTo} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
