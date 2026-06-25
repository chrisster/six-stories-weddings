import { notFound } from "next/navigation";

import { completePortalClaimAction } from "@/app/portal/actions";
import { verifyPortalClaimToken } from "@/lib/portal-auth";

type PortalClaimPageProps = {
  searchParams: Promise<{ token?: string; error?: string }>;
};

export default async function PortalClaimPage({ searchParams }: PortalClaimPageProps) {
  const { token = "", error } = await searchParams;
  const claim = verifyPortalClaimToken(token);
  if (!claim) {
    notFound();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(160deg,oklch(0.985_0.01_96),oklch(0.965_0.02_92))] px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-border/70 bg-white/90 p-8 shadow-[0_24px_70px_-45px_rgba(0,0,0,0.6)] backdrop-blur">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Six Stories Studio</p>
        <h1 className="title-cinematic mt-3 text-3xl font-semibold">Set your portal password</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          This access will be linked to <strong>{claim.email}</strong>.
        </p>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <form action={completePortalClaimAction} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={token} />

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="h-11 w-full rounded-xl border border-border px-3 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="text-sm font-medium">Confirm password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              className="h-11 w-full rounded-xl border border-border px-3 text-sm"
            />
          </div>

          <button type="submit" className="h-11 w-full rounded-full border border-foreground bg-foreground text-sm text-background transition hover:opacity-90">
            Activate portal access
          </button>
        </form>
      </section>
    </main>
  );
}