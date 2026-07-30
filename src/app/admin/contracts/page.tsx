import Link from "next/link";

import { canSendContractEmails, resolveContractCcEmail } from "@/lib/contract-notifications";
import { getOrgContractSettings, listContracts } from "@/lib/contract-data";
import { getProjects } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/env";

import { SendContractForm } from "./send-form";
import { ContractRow } from "./contract-row";

export const dynamic = "force-dynamic";

const STATUS_MESSAGES: Record<string, { tone: "ok" | "warn" | "error"; text: string }> = {
  sent: { tone: "ok", text: "Contract sent for signature." },
  resent: { tone: "ok", text: "Signing link reissued and emailed." },
  sent_no_email: {
    tone: "warn",
    text: "Contract created, but email is not configured — copy the signing link manually.",
  },
  voided: { tone: "ok", text: "Contract voided and its signing link disabled." },
  error: { tone: "error", text: "Something went wrong." },
};

type ContractsPageProps = {
  searchParams: Promise<{ status?: string; reason?: string }>;
};

export default async function ContractsPage({ searchParams }: ContractsPageProps) {
  const { status, reason } = await searchParams;

  const [contracts, projects, org] = await Promise.all([
    listContracts(),
    getProjects(),
    getOrgContractSettings(),
  ]);

  const emailReady = canSendContractEmails();
  const ccEmail = resolveContractCcEmail(org.contractCcEmail);
  const banner = status ? STATUS_MESSAGES[status] : null;

  const pending = contracts.filter((c) => c.status === "sent" || c.status === "viewed").length;
  const signed = contracts.filter((c) => c.status === "signed").length;

  return (
    <div className="space-y-6">
      <section className="soft-panel p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 className="title-cinematic text-2xl font-semibold">Contracts</h2>
          <p className="text-xs text-muted-foreground">
            {pending} awaiting signature · {signed} signed
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Signed copies are emailed to the client and CC&rsquo;d to{" "}
          <span className="font-medium text-foreground">{ccEmail}</span>.
        </p>

        {banner ? (
          <div
            className={
              banner.tone === "ok"
                ? "mt-4 rounded-xl border border-emerald-300/70 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900"
                : banner.tone === "warn"
                  ? "mt-4 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
                  : "mt-4 rounded-xl border border-red-300/70 bg-red-50 px-4 py-2.5 text-sm text-red-900"
            }
          >
            {banner.text}
            {status === "error" && reason ? ` ${reason}` : null}
          </div>
        ) : null}

        {!emailReady ? (
          <div className="mt-4 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            Email delivery is not configured. Contracts can still be created — copy the signing link
            and send it yourself. Set <code className="text-xs">RESEND_API_KEY</code> or the{" "}
            <code className="text-xs">SMTP_*</code> vars to enable automatic sending.
          </div>
        ) : null}

        <details className="mt-4">
          <summary className="inline-flex cursor-pointer select-none items-center rounded-xl border border-border px-4 py-2 text-sm hover:border-foreground/40">
            + Send a contract
          </summary>
          <div className="mt-4">
            <SendContractForm
              projects={projects.map((project) => ({
                id: project.id,
                title: project.title,
                clientEmail: project.clients?.[0]?.email ?? null,
                clientName: project.clients?.[0]?.fullName ?? null,
              }))}
            />
          </div>
        </details>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-white/80">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((contract) => (
              <ContractRow key={contract.id} contract={contract} />
            ))}
            {contracts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {hasSupabaseEnv
                    ? "No contracts yet. Send one from a project or with the form above."
                    : "Demo mode: configure Supabase to manage contracts."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-muted-foreground">
        Wording is managed in the active contract template.{" "}
        <Link href="/admin/organization" className="underline underline-offset-2">
          Studio details
        </Link>{" "}
        (legal name, ΑΦΜ, Δ.Ο.Υ., representatives) appear in the contract header.
      </p>
    </div>
  );
}
