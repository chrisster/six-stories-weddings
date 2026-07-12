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
