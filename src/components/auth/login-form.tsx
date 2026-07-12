"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!hasSupabaseEnv) {
      setError("Supabase env vars are not configured.");
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.push("/admin");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  async function onForgotPassword() {
    setError(null);
    setNotice(null);

    if (!hasSupabaseEnv) {
      setError("Supabase env vars are not configured.");
      return;
    }

    if (!email.trim()) {
      setError("Enter your email above, then click “Forgot password?”.");
      return;
    }

    setResetLoading(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setNotice("Check your inbox for a link to set a new password.");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-foreground/50"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-foreground/50"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onForgotPassword}
            disabled={resetLoading}
            className="text-xs text-muted-foreground underline underline-offset-4 transition hover:text-foreground disabled:opacity-60"
          >
            {resetLoading ? "Sending…" : "Forgot password?"}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

      <Button type="submit" className="h-10 w-full rounded-full" disabled={isLoading}>
        {isLoading ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}