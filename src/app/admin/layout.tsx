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
      <header className="mb-8 flex flex-col gap-4 rounded-2xl border border-border/80 bg-white/80 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="space-y-1">
          <Link href="/" className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
            Six Stories Studio
          </Link>
          <h1 className="title-cinematic text-2xl font-semibold">Wedding Studio Dashboard</h1>
        </div>

        <div className="flex items-center gap-2">
          {hasSupabaseEnv ? <LogoutButton /> : null}
        </div>
      </header>

      <div className="mb-6">
        <AdminNav />
      </div>

      {!hasSupabaseEnv ? (
        <div className="mb-6 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Running in demo mode. Configure Supabase env vars to enable cloud data and authentication.
        </div>
      ) : null}

      {children}
    </div>
  );
}