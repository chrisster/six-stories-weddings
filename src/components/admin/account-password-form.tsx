"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function AccountPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setReady(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setReady(Boolean(session));
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
      setMessage("Password updated. You can keep working.");
      setPassword("");
      setConfirm("");
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
