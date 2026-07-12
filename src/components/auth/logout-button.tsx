"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();

  async function signOut() {
    if (hasSupabaseEnv) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }

    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="inline-flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-foreground/[0.03] hover:text-foreground"
    >
      <LogOut className="size-[18px]" strokeWidth={1.8} />
      Log out
    </button>
  );
}