import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="relative flex flex-1 items-center py-16 sm:py-24">
      <div className="container-editorial">
        <section className="grid gap-10 rounded-3xl border border-border/70 bg-white/75 p-8 shadow-sm backdrop-blur md:grid-cols-[1.1fr_0.9fr] md:p-12">
          <div className="space-y-6">
            <p className="text-xs tracking-[0.35em] text-muted-foreground uppercase">Six Stories Studio</p>
            <h1 className="title-cinematic text-4xl leading-tight font-semibold sm:text-6xl">
              Wedding Projects and Cinematic Client Galleries
            </h1>
            <p className="max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
              A private studio workspace for managing wedding productions and delivering elegant,
              passcode-protected galleries to each couple.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/admin" className={cn(buttonVariants(), "h-10 rounded-full px-6")}>
                Open Studio Dashboard
              </Link>
              <Link
                href="/g/joost-stav-2026"
                className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-full px-6")}
              >
                View Demo Gallery
              </Link>
            </div>
          </div>
          <div className="soft-panel relative min-h-[320px] overflow-hidden p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(222,199,163,0.35),transparent_45%),linear-gradient(135deg,rgba(255,255,255,0.7),rgba(246,241,235,0.85))]" />
            <div className="relative space-y-4">
              <p className="text-xs tracking-[0.25em] text-muted-foreground uppercase">Included in MVP</p>
              <ul className="space-y-2 text-sm text-foreground/90">
                <li>Private admin dashboard for projects, budgets, crew, and deliverables</li>
                <li>Client galleries with photo/video sections and cinematic layout</li>
                <li>Publish controls, passcode protection, and download permissions</li>
                <li>Supabase-backed schema with demo seed data for immediate testing</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
