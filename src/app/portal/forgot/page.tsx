import Link from "next/link";

import { requestPortalAccessLinkAction } from "@/app/portal/actions";

type PortalForgotPageProps = {
  searchParams: Promise<{ sent?: string; error?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  expired:
    "This link has expired or has already been used. Enter your email below and we will send you a new one.",
  email: "Enter the email address your gallery invitation was sent to.",
  unavailable: "The client portal is unavailable right now. Please try again later.",
};

export default async function PortalForgotPage({ searchParams }: PortalForgotPageProps) {
  const { sent, error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] || ERROR_MESSAGES.unavailable : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(160deg,oklch(0.985_0.01_96),oklch(0.965_0.02_92))] px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-border/70 bg-white/90 p-8 shadow-[0_24px_70px_-45px_rgba(0,0,0,0.6)] backdrop-blur">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Six Stories Studio</p>
        <h1 className="title-cinematic mt-3 text-3xl font-semibold">Set a new password</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Enter the email address your gallery invitation was sent to. We will email you a link to
          choose a new password for the client portal.
        </p>

        {errorMessage ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {sent ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            If that email has access to a Six Stories gallery, a link to set your password is on its
            way. It is valid for 7 days. If it has not arrived in a few minutes, check your spam
            folder.
          </div>
        ) : null}

        <form action={requestPortalAccessLinkAction} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="h-11 w-full rounded-xl border border-border px-3 text-sm"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            className="h-11 w-full rounded-full border border-foreground bg-foreground text-sm text-background transition hover:opacity-90"
          >
            Email me a link
          </button>
        </form>

        <Link
          href="/portal/login"
          className="mt-6 inline-block text-sm text-muted-foreground underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
