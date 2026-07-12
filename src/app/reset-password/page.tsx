import Link from "next/link";

import { AccountPasswordForm } from "@/components/admin/account-password-form";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(160deg,oklch(0.985_0.01_96),oklch(0.965_0.02_92))] px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-border/70 bg-white/90 p-8 shadow-[0_24px_70px_-45px_rgba(0,0,0,0.6)] backdrop-blur">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/six-stories-logo.png" alt="Six Stories Studio" className="mb-6 h-11 w-auto" />
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Six Stories Studio</p>
        <h1 className="title-cinematic mt-3 text-3xl font-semibold">Set your password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose a password for your account. After saving, you can sign in.
        </p>

        <AccountPasswordForm />

        <Link
          href="/admin"
          className="mt-6 inline-block text-sm text-muted-foreground underline underline-offset-4"
        >
          Go to the studio workspace
        </Link>
      </section>
    </main>
  );
}
