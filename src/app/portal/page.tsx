import Link from "next/link";
import { redirect } from "next/navigation";

import { portalLogoutAction } from "@/app/portal/actions";
import { getPortalGalleriesForEmail } from "@/lib/data";
import { readPortalSession } from "@/lib/portal-auth";

export default async function PortalDashboardPage() {
  const session = await readPortalSession();
  if (!session) {
    redirect("/portal/login");
  }

  const galleries = await getPortalGalleriesForEmail(session.email);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#faf8f3,#f3eee5)] px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-border/70 bg-white/90 p-6 shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Six Stories Studio</p>
            <h1 className="title-cinematic mt-3 text-3xl font-semibold">Your client portal</h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Signed in as {session.email}. Your published galleries will appear here.
            </p>
          </div>

          <form action={portalLogoutAction}>
            <button type="submit" className="rounded-full border border-border px-4 py-2 text-sm hover:border-foreground/30">
              Sign out
            </button>
          </form>
        </header>

        {galleries.length === 0 ? (
          <section className="rounded-3xl border border-border/70 bg-white/90 p-8 text-sm text-muted-foreground shadow-sm">
            No published galleries are linked to your email yet.
          </section>
        ) : (
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {galleries.map((gallery) => (
              <article key={gallery.galleryId} className="overflow-hidden rounded-3xl border border-border/70 bg-white shadow-sm">
                <div className="aspect-[4/3] bg-zinc-200">
                  {gallery.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={gallery.coverUrl} alt={gallery.title} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="space-y-3 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Published gallery</p>
                  <h2 className="title-cinematic text-2xl font-semibold">{gallery.projectTitle}</h2>
                  {gallery.eventDate ? <p className="text-sm text-muted-foreground">{gallery.eventDate}</p> : null}
                  <Link href={`/g/${gallery.slug}`} className="inline-flex rounded-full border border-foreground bg-foreground px-4 py-2 text-sm text-background transition hover:opacity-90">
                    Open gallery
                  </Link>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}