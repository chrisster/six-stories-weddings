"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function AccountPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function establishSession() {
      try {
        // Implicit recovery: tokens arrive in the URL hash.
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;
        if (hash) {
          const params = new URLSearchParams(hash);
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (!error) {
              setReady(true);
              window.history.replaceState(null, "", window.location.pathname);
              return;
            }
          }
        }

        // PKCE recovery: a `code` arrives in the query string.
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) {
            setReady(true);
            window.history.replaceState(null, "", window.location.pathname);
            return;
          }
        }

        // Otherwise fall back to any existing session.
        const { data } = await supabase.auth.getSession();
        setReady(Boolean(data.session));
      } catch {
        setReady(false);
      }
    }

    void establishSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setMessage("Password updated. Redirecting to your workspace…");
      setPassword("");
      setConfirm("");
      router.push("/admin");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 max-w-sm space-y-3">
      {!ready ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Waiting for your session… If you arrived from an invite link, give it a moment.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">New password</label>
        <input
          id="password"
          type="password"
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 w-full rounded-xl border border-border px-3 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm" className="text-sm font-medium">Confirm password</label>
        <input
          id="confirm"
          type="password"
          minLength={8}
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className="h-11 w-full rounded-xl border border-border px-3 text-sm"
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="h-11 rounded-full border border-foreground bg-foreground px-5 text-sm text-background transition hover:opacity-90 disabled:opacity-60"
      >
        {loading ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
