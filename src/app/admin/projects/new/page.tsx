import Link from "next/link";

import { createProjectAction } from "@/app/admin/projects/actions";
import { hasSupabaseEnv } from "@/lib/env";

export default function NewWeddingPage() {
  return (
    <div className="space-y-6">
      <section className="soft-panel p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">New Wedding</p>
            <h2 className="title-cinematic mt-1 text-3xl font-semibold">Create Project</h2>
          </div>
          <Link href="/admin/projects" className="rounded-full border border-border px-4 py-2 text-sm hover:border-foreground/30">
            Back to projects
          </Link>
        </div>

        {!hasSupabaseEnv ? (
          <p className="mb-4 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Demo mode is active. Configure Supabase to persist new weddings.
          </p>
        ) : null}

        <form action={createProjectAction} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <input name="title" required placeholder="Project title" className="h-10 rounded-xl border border-border bg-white px-3 text-sm" />
          <input name="eventDate" type="date" required className="h-10 rounded-xl border border-border bg-white px-3 text-sm" />
          <input
            name="projectType"
            defaultValue="Wedding Photo + Video"
            placeholder="Project type"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />
          <select name="status" defaultValue="unconfirmed" className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
            <option value="confirmed">Confirmed</option>
            <option value="unconfirmed">Unconfirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            name="editingStatus"
            defaultValue="not_started"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          >
            <option value="not_started">Editing: Not Started</option>
            <option value="in_progress">Editing: In Progress</option>
            <option value="review">Editing: Review</option>
            <option value="completed">Editing: Completed</option>
          </select>
          <input
            name="budgetTotal"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            placeholder="Budget total"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />
          <input
            name="amountPaid"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            placeholder="Amount paid"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />
          <input
            name="notes"
            placeholder="Project notes"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />

          <input
            name="clientName"
            placeholder="Primary client name"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />
          <input
            name="clientEmail"
            type="email"
            placeholder="Client email"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />
          <input
            name="clientPhone"
            placeholder="Client phone"
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />

          <button type="submit" className="h-10 rounded-xl border border-foreground bg-foreground px-4 text-sm text-background xl:justify-self-start">
            Create wedding
          </button>
        </form>
      </section>
    </div>
  );
}
