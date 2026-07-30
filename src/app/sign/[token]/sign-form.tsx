"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { submitSignatureAction, type SignActionState } from "@/app/sign/[token]/actions";
import { SignaturePad } from "@/components/contracts/signature-pad";
import { strings, type ContractLanguage } from "@/lib/contract-i18n";

const initialState: SignActionState = { status: "idle" };

const fieldClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";
const labelClass = "mb-1.5 block text-xs font-medium uppercase tracking-[0.1em] text-neutral-600";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-red-600">{message}</p>;
}

export function SignForm({
  token,
  language,
  consentText,
  defaultFirstName,
  defaultLastName,
  recipientEmail,
}: {
  token: string;
  language: ContractLanguage;
  consentText: string;
  defaultFirstName: string;
  defaultLastName: string;
  recipientEmail: string;
}) {
  const t = strings(language);
  const [state, formAction, isPending] = useActionState(submitSignatureAction, initialState);
  const [isCompany, setIsCompany] = useState(false);
  const [signatureKind, setSignatureKind] = useState<"typed" | "drawn">("typed");
  const [drawnSignature, setDrawnSignature] = useState("");
  const [typedSignature, setTypedSignature] = useState("");

  if (state.status === "success") {
    return (
      <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-9 text-center">
        <CheckCircle2 className="mx-auto size-9 text-emerald-600" strokeWidth={1.6} />
        <h2 className="mt-3 text-base font-medium text-emerald-900">
          {t.successTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-emerald-800">
          {state.message}
        </p>
        <p className="mt-4 text-xs text-emerald-700">{t.successClose}</p>
      </div>
    );
  }

  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="mt-8 space-y-6">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="signatureKind" value={signatureKind} />
      <input type="hidden" name="signatureDrawn" value={drawnSignature} />

      <div>
        <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-neutral-800">
          {t.yourDetails}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          {t.detailsNote} ({recipientEmail})
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-3">
        <input
          type="checkbox"
          name="isCompany"
          checked={isCompany}
          onChange={(event) => setIsCompany(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-neutral-800"
        />
        <span className="text-sm text-neutral-700">
          {t.companyToggle}
          <span className="mt-0.5 block text-xs text-neutral-500">{t.companyToggleHint}</span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="firstName">
            {t.firstName}
          </label>
          <input
            id="firstName"
            name="firstName"
            defaultValue={defaultFirstName}
            autoComplete="given-name"
            className={fieldClass}
            required
          />
          <FieldError message={errors.firstName} />
        </div>
        <div>
          <label className={labelClass} htmlFor="lastName">
            {t.lastName}
          </label>
          <input
            id="lastName"
            name="lastName"
            defaultValue={defaultLastName}
            autoComplete="family-name"
            className={fieldClass}
            required
          />
          <FieldError message={errors.lastName} />
        </div>
      </div>

      {isCompany ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="companyName">
              {t.companyName}
            </label>
            <input id="companyName" name="companyName" className={fieldClass} />
            <FieldError message={errors.companyName} />
          </div>
          <div>
            <label className={labelClass} htmlFor="taxOffice">
              {t.taxOffice}
            </label>
            <input id="taxOffice" name="taxOffice" className={fieldClass} />
            <FieldError message={errors.taxOffice} />
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="city">
            {t.city}
          </label>
          <input
            id="city"
            name="city"
            autoComplete="address-level2"
            className={fieldClass}
            required
          />
          <FieldError message={errors.city} />
        </div>
        <div>
          <label className={labelClass} htmlFor="street">
            {t.street}
          </label>
          <input
            id="street"
            name="street"
            autoComplete="street-address"
            className={fieldClass}
            required
          />
          <FieldError message={errors.street} />
        </div>
      </div>

      <div className="sm:max-w-xs">
        <label className={labelClass} htmlFor="vatId">
          {t.vatId}
        </label>
        <input
          id="vatId"
          name="vatId"
          inputMode="numeric"
          maxLength={12}
          placeholder={t.vatIdPlaceholder}
          className={fieldClass}
          required
        />
        <FieldError message={errors.vatId} />
      </div>

      {/* --- Signature ---------------------------------------------------- */}
      <div className="border-t border-neutral-200 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-neutral-800">
          {t.signature}
        </h2>

        <div className="mt-3 inline-flex rounded-lg border border-neutral-300 p-0.5">
          {(
            [
              ["typed", t.typeTab],
              ["drawn", t.drawTab],
            ] as [typeof signatureKind, string][]
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              onClick={() => setSignatureKind(kind)}
              className={
                signatureKind === kind
                  ? "rounded-md bg-neutral-900 px-3.5 py-1.5 text-xs font-medium text-white"
                  : "rounded-md px-3.5 py-1.5 text-xs text-neutral-600 hover:text-neutral-900"
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {signatureKind === "typed" ? (
            <div>
              <label className={labelClass} htmlFor="signatureTyped">
                {t.typePrompt}
              </label>
              <input
                id="signatureTyped"
                name="signatureTyped"
                value={typedSignature}
                onChange={(event) => setTypedSignature(event.target.value)}
                autoComplete="off"
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-3 font-serif text-xl text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
              />
              <p className="mt-1.5 text-xs text-neutral-500">
                {t.typedNote}
              </p>
            </div>
          ) : (
            <SignaturePad
              value={drawnSignature}
              onChange={setDrawnSignature}
              ariaLabel={t.signature}
              language={language}
            />
          )}
          <FieldError message={errors.signature} />
        </div>
      </div>

      {/* --- Consent ------------------------------------------------------ */}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-3">
        <input
          type="checkbox"
          name="consent"
          className="mt-0.5 size-4 shrink-0 accent-neutral-800"
          required
        />
        <span className="text-sm leading-relaxed text-neutral-700">{consentText}</span>
      </label>
      <FieldError message={errors.consent} />

      {state.status === "error" && state.message ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-5 py-3.5 text-sm font-medium uppercase tracking-[0.16em] text-white transition hover:bg-neutral-800 disabled:opacity-60"
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        {isPending ? t.submitting : t.submit}
      </button>
    </form>
  );
}
