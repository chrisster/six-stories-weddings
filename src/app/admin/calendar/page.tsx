import Link from "next/link";
import { format, parseISO } from "date-fns";

import { getProjects } from "@/lib/data";

export default async function CalendarPage() {
  const projects = await getProjects();

  return (
    <div className="space-y-5">
      <section className="soft-panel p-5">
        <h2 className="title-cinematic text-3xl font-semibold">Wedding Calendar</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Month-first view of all upcoming and confirmed project dates.
        </p>
      </section>

      <section className="space-y-3">
        {projects.map((project) => (
          <article key={project.id} className="soft-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
                  {format(parseISO(project.eventDate), "MMMM d, yyyy")}
                </p>
                <h3 className="mt-1 text-lg font-semibold">{project.title}</h3>
              </div>
              <Link
                href={`/admin/projects/${project.id}`}
                className="rounded-full border border-border px-3 py-1.5 text-sm hover:border-foreground/30"
              >
                Open project
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}