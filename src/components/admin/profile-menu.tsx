"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, ChevronDown, LogOut, Settings, UserCircle } from "lucide-react";

import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export function ProfileMenu({ role }: { role?: "admin" | "crew" | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isAdmin = role !== "crew";

  async function signOut() {
    if (hasSupabaseEnv) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.push("/");
    router.refresh();
  }

  const itemCls =
    "inline-flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-foreground/[0.03] hover:text-foreground";

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-foreground/[0.03] hover:text-foreground"
      >
        <UserCircle className="size-[18px]" strokeWidth={1.8} />
        Profile
        <ChevronDown
          className={`ml-auto size-4 transition ${open ? "rotate-180" : ""}`}
          strokeWidth={1.8}
        />
      </button>

      {open ? (
        <div className="mt-1 space-y-0.5 pl-2">
          <Link href="/admin/account" className={itemCls} onClick={() => setOpen(false)}>
            <Settings className="size-[18px]" strokeWidth={1.8} />
            Settings
          </Link>
          {isAdmin ? (
            <Link href="/admin/organization" className={itemCls} onClick={() => setOpen(false)}>
              <Building2 className="size-[18px]" strokeWidth={1.8} />
              Organization
            </Link>
          ) : null}
          <button type="button" onClick={signOut} className={itemCls}>
            <LogOut className="size-[18px]" strokeWidth={1.8} />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
