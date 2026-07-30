import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";

import { requireAdminRole } from "@/lib/auth";
import { listContractTemplates } from "@/lib/contract-data";
import { hasSupabaseEnv } from "@/lib/env";

import { setActiveTemplateAction } from "./actions";
import { TemplateEditor } from "./template-editor";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { tone: "ok" | "error"; text: string }> = {
  saved: { tone: "ok", text: "Wording saved." },
  active: { tone: "ok", text: "Default template updated." },
  error: { tone: "error", text: "Could not save" },
};

type PageProps = {
  searchParams: Promise<{ status?: string; reason?: string; template?: string }>;
};

const LANGUAGE_LABELS: Record<string, string> = { el: "Ελληνικά", en: "English" };

export default async function ContractTemplatesPage({ searchParams }: PageProps) {
  await requireAdminRole();
  const { status, reason, template: requestedId } = await searchParams;

  const templates = await listContractTemplates();
  const selected =
    templates.find((candidate) => candidate.id === requestedId) ??
    templates.find((candidate) => candidate.isActive) ??
    templates[0] ??
    null;

  const banner = status ? STATUS[status] : null;

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/admin/organization"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.8} />
          Organization
        </Link>
        <h1 className="title-cinematic mt-2 text-3xl font-semibold">Contract wording</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Edit the text of your contracts. The language you pick also drives the signing page, the
          emails, and the PDF labels.
        </p>
      </header>

      {banner ? (
        <div
          className={
            banner.tone === "ok"
              ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700"
              : "rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
          }
        >
          {banner.text}
          {status === "error" && reason ? `: ${decodeURIComponent(reason)}` : null}
        </div>
      ) : null}

      {!hasSupabaseEnv ? (
        <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Demo mode: configure Supabase to edit templates.
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No templates found. Run <code className="text-xs">npm run seed:contract-template</code> to
          load the Greek and English defaults.
        </div>
      ) : (
        <>
          {/* --- Template picker -------------------------------------------- */}
          <div className="flex flex-wrap items-center gap-1.5">
            {templates.map((candidate) => {
              const isSelected = selected?.id === candidate.id;
              return (
                <Link
                  key={candidate.id}
                  href={`/admin/organization/templates?template=${candidate.id}`}
                  className={
                    isSelected
                      ? "inline-flex items-center gap-2 rounded-xl bg-foreground/[0.07] px-3 py-1.5 text-sm font-medium"
                      : "inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-foreground/[0.03] hover:text-foreground"
                  }
                >
                  {candidate.snapshot.name}
                  <span className="text-xs text-muted-foreground">
                    {LANGUAGE_LABELS[candidate.snapshot.language] ?? candidate.snapshot.language}
                  </span>
                  {candidate.isActive ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                      <Check className="size-2.5" strokeWidth={2.5} />
                      Default
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>

          {selected ? (
            <section className="rounded-3xl border border-border/70 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-6">
              {!selected.isActive ? (
                <form action={setActiveTemplateAction} className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-muted/25 px-3.5 py-2.5">
                  <input type="hidden" name="templateId" value={selected.id} />
                  <p className="text-sm text-muted-foreground">
                    This template is not the default offered when sending.
                  </p>
                  <button
                    type="submit"
                    className="ml-auto rounded-lg border border-border bg-white px-3 py-1.5 text-xs transition hover:border-foreground/40"
                  >
                    Make default
                  </button>
                </form>
              ) : null}

              <TemplateEditor
                key={selected.id}
                templateId={selected.id}
                snapshot={selected.snapshot}
              />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
