import Link from "next/link";

import { portalLoginAction } from "@/app/portal/actions";

type PortalLoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function PortalLoginPage({ searchParams }: PortalLoginPageProps) {
  const { error, next } = await searchParams;

  return (
    <main className="flex min-h-screen flex-1 flex-col lg:grid lg:grid-cols-2">
      <section
        className="relative min-h-[38vh] overflow-hidden bg-cover bg-center lg:min-h-screen"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(0,0,0,0.18), rgba(0,0,0,0.34)), url('https://sixstoriesstudio.com/wp-content/uploads/2025/10/R6__8045.jpg')",
        }}
        aria-label="Six Stories Studio wedding photography"
      />

      <section className="flex min-h-[62vh] items-center justify-center bg-[linear-gradient(160deg,oklch(0.985_0.01_96),oklch(0.965_0.02_92))] px-6 py-10 sm:px-10 lg:min-h-screen lg:px-16">
        <div className="w-full max-w-lg rounded-3xl border border-border/70 bg-white/88 p-7 shadow-[0_24px_70px_-45px_rgba(0,0,0,0.6)] backdrop-blur sm:p-10">
          <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground">Six Stories Studio</p>
          <h1 className="title-cinematic mt-3 text-3xl leading-tight font-semibold sm:text-4xl">
            Client Portal Access
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
            Sign in to view your private wedding galleries. If this is your first visit, use your
            email invitation link to claim access and set your password.
          </p>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <form action={portalLoginAction} className="mt-7 space-y-4">
            <input type="hidden" name="next" value={next || "/portal"} />
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="h-11 w-full rounded-xl border border-border px-3 text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="h-11 w-full rounded-xl border border-border px-3 text-sm"
                placeholder="Your portal password"
              />
            </div>

            <button
              type="submit"
              className="h-11 w-full rounded-full border border-foreground bg-foreground text-sm text-background transition hover:opacity-90"
            >
              Sign in
            </button>
          </form>

          <p className="mt-6 text-sm text-muted-foreground">
            Need access? Ask Six Stories Studio to add your email and send a gallery invitation.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block text-sm text-muted-foreground underline underline-offset-4"
          >
            Admin login
          </Link>
        </div>
      </section>
    </main>
  );
}