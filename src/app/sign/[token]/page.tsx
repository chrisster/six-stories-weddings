import { headers } from "next/headers";

import { SignForm } from "@/app/sign/[token]/sign-form";
import { ContractBody } from "@/components/contracts/contract-body";
import { getContractForSigning, markContractViewed } from "@/lib/contract-data";
import { normalizeLanguage, strings } from "@/lib/contract-i18n";
import { renderContract } from "@/lib/contracts";

export const dynamic = "force-dynamic";

type SignPageProps = {
  params: Promise<{ token: string }>;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f3f1ee] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <p className="mb-6 text-center text-sm uppercase tracking-[0.24em] text-neutral-700">
          Six Stories
        </p>
        {children}
      </div>
    </div>
  );
}

function Notice({ title, body, help }: { title: string; body: string; help: string }) {
  return (
    <Shell>
      <div className="rounded-2xl border border-neutral-200 bg-white px-6 py-10 text-center">
        <h1 className="text-lg font-medium text-neutral-900">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-neutral-600">{body}</p>
        <p className="mt-6 text-xs text-neutral-500">{help}</p>
      </div>
    </Shell>
  );
}

export default async function SignPage({ params }: SignPageProps) {
  const { token } = await params;

  const view = await getContractForSigning(token);

  if (!view.ok) {
    // The contract's own language is unknowable when the token does not resolve,
    // so these notices use the studio's default.
    const t = strings("el");
    const notices = {
      not_found: { title: t.invalidTitle, body: t.invalidBody },
      expired: { title: t.expiredTitle, body: t.expiredBody },
      signed: { title: t.signedTitle, body: t.signedBody },
      void: { title: t.voidTitle, body: t.voidBody },
    } as const;

    const notice = notices[view.reason];
    return <Notice title={notice.title} body={notice.body} help={t.helpNote} />;
  }

  const { contract, previewHtmlValues } = view;
  const language = normalizeLanguage(contract.templateSnapshot.language);
  const t = strings(language);

  // Record the view for the audit trail. A GET never consumes the token, so
  // email link scanners cannot invalidate the signing link.
  const headerList = await headers();
  await markContractViewed(token, {
    ip:
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headerList.get("x-real-ip") ||
      null,
    userAgent: headerList.get("user-agent"),
  });

  const rendered = renderContract(contract.templateSnapshot, previewHtmlValues);

  return (
    <Shell>
      <div className="rounded-2xl border border-neutral-200 bg-white px-5 py-7 sm:px-9 sm:py-9">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-neutral-500">{t.toSign}</p>
        {contract.projectTitle ? (
          <p className="mt-1.5 text-center text-sm italic text-neutral-500">
            {contract.projectTitle}
          </p>
        ) : null}

        <div className="mt-7 max-h-[55vh] overflow-y-auto rounded-xl border border-neutral-200 bg-[#fcfbfa] px-5 py-6 sm:px-7">
          <ContractBody rendered={rendered} />
        </div>
        <p className="mt-2.5 text-center text-xs text-neutral-500">{t.autofillNote}</p>

        <SignForm
          token={token}
          language={language}
          consentText={contract.templateSnapshot.consentText}
          defaultFirstName={contract.recipientName?.split(" ")[0] ?? ""}
          defaultLastName={contract.recipientName?.split(" ").slice(1).join(" ") ?? ""}
          recipientEmail={contract.recipientEmail}
        />
      </div>

      <p className="mt-5 text-center text-xs leading-relaxed text-neutral-500">{t.legalNote}</p>
    </Shell>
  );
}
