import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { buttonVariants } from "@/components/ui/button";
import { hasSupabaseEnv } from "@/lib/env";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-1 flex-col lg:grid lg:grid-cols-2">
      <section
        className="relative min-h-[38vh] overflow-hidden bg-cover bg-center lg:min-h-screen"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(0,0,0,0.15), rgba(0,0,0,0.3)), url('https://sixstoriesstudio.com/wp-content/uploads/2025/10/R6__8045.jpg')",
        }}
        aria-label="Six Stories Studio wedding photography"
      />

      <section className="flex min-h-[62vh] items-center justify-center bg-[linear-gradient(160deg,oklch(0.985_0.01_96),oklch(0.965_0.02_92))] px-6 py-10 sm:px-10 lg:min-h-screen lg:px-16">
        <div className="w-full max-w-lg rounded-3xl border border-border/70 bg-white/88 p-7 shadow-[0_24px_70px_-45px_rgba(0,0,0,0.6)] backdrop-blur sm:p-10">
          <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">Six Stories Studio</p>
          <h1 className="title-cinematic mt-3 text-3xl leading-tight font-semibold sm:text-4xl">
            Welcome to the Six Stories Studio Admin
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
            A private workspace for managing wedding productions and delivering elegant galleries
            to each couple.
          </p>

          <div className="mt-7">
            {hasSupabaseEnv ? (
              <LoginForm />
            ) : (
              <div className="space-y-4 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900">
                <p>
                  Supabase environment variables are missing, so authentication is disabled. You
                  can continue in demo mode.
                </p>
                <Link href="/admin" className={cn(buttonVariants(), "h-10 rounded-full")}>
                  Continue to Demo Dashboard
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
