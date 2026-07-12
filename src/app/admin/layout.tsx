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
    <div className="container-editorial py-6 sm:py-8">
      <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="admin-surface h-fit p-4 lg:sticky lg:top-6">
          <p className="quiet-label mb-3">Studio{role === "crew" ? " · Crew" : ""}</p>
          <AdminNav role={role} />
          {hasSupabaseEnv ? (
            <div className="mt-4 border-t border-border/70 pt-3">
              <LogoutButton />
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Demo mode active.
            </p>
          )}
        </aside>

        <main className="min-w-0 space-y-5">
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