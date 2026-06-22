"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
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
    <Button variant="outline" className="h-8 rounded-full px-4" onClick={signOut}>
      Log out
    </Button>
  );
}