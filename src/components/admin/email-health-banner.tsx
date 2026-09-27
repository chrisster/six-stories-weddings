import Link from "next/link";

import { checkEmailDelivery } from "@/lib/gallery-notifications";

/**
 * Red warning across the workspace while emails cannot go out, so a broken
 * mail setup is noticed before a client email silently fails. Rendered inside
 * <Suspense> by the admin layout so the SMTP check never delays the page.
 */
export async function EmailHealthBanner() {
  const status = await checkEmailDelivery();
  if (status.ok) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <p className="font-medium">Emails cannot be sent right now.</p>
      <p className="mt-1 break-words">
        {status.target ? `${status.target}: ` : ""}
        {status.error}
      </p>
      <p className="mt-1">
        Gallery, contract and portal emails will fail until this is fixed.{" "}
        <Link href="/admin/organization#email-delivery" className="underline">
          Check email delivery
        </Link>
      </p>
    </div>
  );
}
