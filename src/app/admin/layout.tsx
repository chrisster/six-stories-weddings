import Link from "next/link";
import { LifeBuoy } from "lucide-react";

import { AdminNav } from "@/components/admin/admin-nav";
import { LogoutButton } from "@/components/auth/logout-button";
import { getCurrentUserRole } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const role = hasSupabaseEnv ? await getCurrentUserRole() : "admin";

  return (
    <div className="flex min-h-screen flex-col bg-[oklch(0.99_0.004_96)] lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-border/60 bg-white px-4 py-5 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-b-0 lg:border-r lg:px-5 lg:py-7">
        <Link href="/admin" className="flex items-center gap-2.5 px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/six-stories-logo.png" alt="Six Stories Studio" className="h-8 w-auto" />
        </Link>

        <p className="mt-1 px-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
          {role === "crew" ? "Crew workspace" : "Studio workspace"}
        </p>

        <div className="mt-6 flex-1">
          <AdminNav role={role} />
        </div>

        <div className="mt-6 space-y-1 border-t border-border/60 pt-4">
          <a
            href="mailto:hello@sixstoriesstudio.com"
            className="inline-flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-foreground/[0.03] hover:text-foreground"
          >
            <LifeBuoy className="size-[18px]" strokeWidth={1.8} />
            Help
          </a>
          {hasSupabaseEnv ? (
            <LogoutButton />
          ) : (
            <p className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Demo mode active.
            </p>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-6xl space-y-6">
          {!hasSupabaseEnv ? (
            <div className="rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Running in demo mode. Configure Supabase env vars to enable cloud data and authentication.
            </div>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  );
}
