"use client";

import { useState } from "react";

import type { ContractRecord } from "@/lib/contract-data";

import { resendContractAction, voidContractAction } from "./actions";

const STATUS_STYLES: Record<ContractRecord["status"], string> = {
  draft: "bg-neutral-100 text-neutral-700",
  sent: "bg-blue-50 text-blue-700",
  viewed: "bg-amber-50 text-amber-800",
  signed: "bg-emerald-50 text-emerald-700",
  void: "bg-neutral-100 text-neutral-500 line-through",
};

const STATUS_LABELS: Record<ContractRecord["status"], string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  void: "Void",
};

function formatWhen(contract: ContractRecord) {
  const iso = contract.signedAt || contract.viewedAt || contract.sentAt || contract.createdAt;
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

export function ContractRow({
  contract,
  selected,
  onToggle,
}: {
  contract: ContractRecord;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const [confirmingVoid, setConfirmingVoid] = useState(false);
  const canResend = contract.status === "sent" || contract.status === "viewed";
  const canVoid = contract.status !== "signed" && contract.status !== "void";

  return (
    <tr
      className={`border-b border-border/60 last:border-b-0 align-top ${
        selected ? "bg-foreground/[0.035]" : ""
      }`}
    >
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(contract.id)}
          aria-label={`Select contract for ${contract.recipientName || contract.recipientEmail}`}
          className="size-4 accent-neutral-800"
        />
      </td>

      <td className="px-4 py-3">
        <p className="font-medium text-foreground">{contract.recipientName || "—"}</p>
        <p className="text-xs text-muted-foreground">{contract.recipientEmail}</p>
        {contract.signer?.vatId ? (
          <p className="mt-0.5 text-xs text-muted-foreground">ΑΦΜ {contract.signer.vatId}</p>
        ) : null}
      </td>

      <td className="px-4 py-3 text-muted-foreground">{contract.projectTitle || "—"}</td>

      <td className="px-4 py-3">
        <span
          className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[contract.status]}`}
        >
          {STATUS_LABELS[contract.status]}
        </span>
        {contract.status === "void" && contract.voidReason ? (
          <p className="mt-1 text-xs text-muted-foreground">{contract.voidReason}</p>
        ) : null}
      </td>

      <td className="px-4 py-3 text-xs text-muted-foreground">{formatWhen(contract)}</td>

      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {contract.status === "signed" && contract.pdfPath ? (
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
          <p className="mt-1.5 text-right font-mono text-[10px] text-muted-foreground">
            {contract.pdfSha256.slice(0, 16)}…
          </p>
        ) : null}
      </td>
    </tr>
  );
}
