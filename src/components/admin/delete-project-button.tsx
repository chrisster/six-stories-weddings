"use client";

import { deleteProjectAction } from "@/app/admin/projects/actions";

export function DeleteProjectButton({ projectId, projectTitle }: { projectId: string; projectTitle: string }) {
  return (
    <form
      action={deleteProjectAction}
      onSubmit={(e) => {
        if (!confirm(`Delete "${projectTitle}"? This cannot be undone.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <button
        type="submit"
        className="rounded-full border border-red-200 px-4 py-2 text-sm text-red-600 hover:border-red-400 hover:bg-red-50"
      >
        Delete project
      </button>
    </form>
  );
}
