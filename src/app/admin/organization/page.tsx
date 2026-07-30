import Link from "next/link";

import { requireAdminRole } from "@/lib/auth";
import { getOrganizationSettings } from "@/lib/data";

import { saveOrganizationSettingsAction } from "./actions";

type OrganizationPageProps = {
  searchParams: Promise<{ status?: string; reason?: string }>;
};

const fieldCls = "h-10 w-full rounded-xl border border-border px-3 text-sm";
const labelCls = "text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground";

export default async function OrganizationPage({ searchParams }: OrganizationPageProps) {
  await requireAdminRole();
  const { status, reason } = await searchParams;
  const settings = await getOrganizationSettings();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs tracking-[0.25em] text-muted-foreground uppercase">Studio</p>
        <h1 className="title-cinematic mt-2 text-3xl font-semibold">Organization</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your studio profile and contact details.
        </p>
      </header>

      {status === "saved" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          Organization settings saved.
        </div>
      ) : null}
      {status === "error" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Could not save settings{reason ? `: ${decodeURIComponent(reason)}` : "."}
        </div>
      ) : null}

      <section className="rounded-3xl border border-border/70 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-6">
        <form action={saveOrganizationSettingsAction} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="studioName" className={labelCls}>Studio name</label>
            <input id="studioName" name="studioName" defaultValue={settings.studioName} placeholder="Six Stories Studio" className={fieldCls} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="contactEmail" className={labelCls}>Contact email</label>
            <input id="contactEmail" name="contactEmail" type="email" defaultValue={settings.contactEmail} className={fieldCls} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="replyToEmail" className={labelCls}>Reply-to email</label>
            <input id="replyToEmail" name="replyToEmail" type="email" defaultValue={settings.replyToEmail} className={fieldCls} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="phone" className={labelCls}>Phone</label>
            <input id="phone" name="phone" defaultValue={settings.phone} className={fieldCls} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="website" className={labelCls}>Website</label>
            <input id="website" name="website" defaultValue={settings.website} placeholder="https://sixstoriesstudio.com" className={fieldCls} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="address" className={labelCls}>Address</label>
            <textarea id="address" name="address" defaultValue={settings.address} rows={2} className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
          </div>

          {/* --- Contract identity ---------------------------------------- */}
          <div className="mt-2 border-t border-border/70 pt-5 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={labelCls}>Contract details</p>
              <Link
                href="/admin/organization/templates"
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs transition hover:border-foreground/40"
              >
                Edit contract wording →
              </Link>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              These appear in the counterparty block of every contract you send. Leave blank to use
              the built-in Photoshooters O.E. defaults.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="legalName" className={labelCls}>Legal name</label>
            <input id="legalName" name="legalName" defaultValue={settings.legalName} placeholder="Photoshooters O.E." className={fieldCls} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="city" className={labelCls}>City (place of signing)</label>
            <input id="city" name="city" defaultValue={settings.city} placeholder="Θεσσαλονίκη" className={fieldCls} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="vatId" className={labelCls}>ΑΦΜ</label>
            <input id="vatId" name="vatId" defaultValue={settings.vatId} placeholder="801971850" className={fieldCls} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="taxOffice" className={labelCls}>Δ.Ο.Υ.</label>
            <input id="taxOffice" name="taxOffice" defaultValue={settings.taxOffice} placeholder="Δ’ Θεσσαλονίκης" className={fieldCls} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="registryNo" className={labelCls}>ΓΕΜΗ</label>
            <input id="registryNo" name="registryNo" defaultValue={settings.registryNo} placeholder="167326506000" className={fieldCls} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="representativeName" className={labelCls}>Legal representatives</label>
            <input id="representativeName" name="representativeName" defaultValue={settings.representativeName} placeholder="Αριστομένη Καραμπουρνιώτη και Χρήστο Στεργιόπουλο" className={fieldCls} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="bankName" className={labelCls}>Bank</label>
            <input id="bankName" name="bankName" defaultValue={settings.bankName} className={fieldCls} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="bankIban" className={labelCls}>IBAN</label>
            <input id="bankIban" name="bankIban" defaultValue={settings.bankIban} className={fieldCls} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="contractCcEmail" className={labelCls}>Contract CC email</label>
            <input id="contractCcEmail" name="contractCcEmail" type="email" defaultValue={settings.contractCcEmail} placeholder="sixstoriesstudio@gmail.com" className={fieldCls} />
            <p className="text-xs text-muted-foreground">Copied on every signed contract.</p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="signatureImageFile" className={labelCls}>Studio stamp / signature</label>
            {/* Carried through unchanged unless a new file is uploaded, so the
                stored data URI never has to sit in a visible form field. */}
            <input type="hidden" name="existingSignatureImage" value={settings.signatureImageUrl} />

            {settings.signatureImageUrl ? (
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/70 bg-muted/30 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={settings.signatureImageUrl}
                  alt="Studio stamp used to countersign contracts"
                  className="h-16 w-auto max-w-[260px] object-contain"
                />
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" name="removeSignatureImage" className="size-3.5 accent-red-600" />
                  Remove
                </label>
              </div>
            ) : (
              <p className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Not set — the «Η ΕΤΑΙΡΕΙΑ» block on contracts prints a blank line.
              </p>
            )}

            <input
              id="signatureImageFile"
              name="signatureImageFile"
              type="file"
              accept="image/png,image/jpeg"
              className="mt-2 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-white file:px-3 file:py-1.5 file:text-sm hover:file:border-foreground/40"
            />
            <p className="text-xs text-muted-foreground">
              Upload a scan of your stamp. The white background is removed automatically so it sits
              cleanly on the signature line.
            </p>
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition hover:opacity-90"
            >
              Save changes
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
