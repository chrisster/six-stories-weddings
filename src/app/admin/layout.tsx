import Link from "next/link";

import { AdminNav } from "@/components/admin/admin-nav";
import { LogoutButton } from "@/components/auth/logout-button";
import { hasSupabaseEnv } from "@/lib/env";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="container-editorial py-6 sm:py-8">
      <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="soft-panel h-fit p-4 lg:sticky lg:top-6">
          <div className="mb-4 rounded-2xl border border-border/70 bg-gradient-to-br from-white to-secondary/50 p-4">
            <Link href="/" className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
              Six Stories Studio
            </Link>
            <h1 className="title-cinematic mt-2 text-2xl font-semibold">Studio OS</h1>
            <p className="mt-1 text-xs text-muted-foreground">Projects, contacts, galleries, delivery.</p>
          </div>
          <AdminNav />

          {hasSupabaseEnv ? (
            <div className="mt-4 pt-4">
              <LogoutButton />
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Demo mode active.
            </p>
          )}
        </aside>

        <main className="space-y-4">
          <header className="soft-panel bg-gradient-to-r from-white/90 via-white/80 to-secondary/60 p-5">
            <p className="text-xs tracking-[0.25em] text-muted-foreground uppercase">Dashboard</p>
            <h2 className="title-cinematic mt-1 text-3xl font-semibold">Wedding Operations</h2>
          </header>

          {!hasSupabaseEnv ? (
            <div className="rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Running in demo mode. Configure Supabase env vars to enable cloud data and authentication.
            </div>
          ) : null}

          {children}
        </main>
      </div>
    </div>
  );
}