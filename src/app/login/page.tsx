import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { buttonVariants } from "@/components/ui/button";
import { hasSupabaseEnv } from "@/lib/env";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  return (
    <main className="container-editorial flex flex-1 items-center py-16">
      <section className="mx-auto w-full max-w-md rounded-3xl border border-border/80 bg-white/85 p-8 shadow-sm backdrop-blur">
        <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">Six Stories Studio</p>
        <h1 className="title-cinematic mt-3 text-3xl font-semibold">Admin Login</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use your Supabase Auth credentials to access the private studio dashboard.
        </p>

        <div className="mt-6">
          {hasSupabaseEnv ? (
            <LoginForm />
          ) : (
            <div className="space-y-4 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900">
              <p>
                Supabase environment variables are missing, so authentication is disabled.
                You can continue in demo mode.
              </p>
              <Link href="/admin" className={cn(buttonVariants(), "h-10 rounded-full")}>Continue to Demo Dashboard</Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}