/**
 * Instant loading state for every studio page. It appears the moment a
 * sidebar link is clicked, while the page's data is fetched, and it lets
 * <Link> prefetch the route shell so the transition starts without waiting
 * for a server round trip.
 */
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-3">
          <div className="h-8 w-64 rounded-lg bg-foreground/[0.06]" />
          <div className="h-4 w-40 rounded bg-foreground/[0.05]" />
        </div>
        <div className="h-11 w-36 rounded-full bg-foreground/[0.06]" />
      </div>

      <div className="rounded-3xl border border-border/70 bg-white p-1.5">
        <div className="grid grid-cols-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2 px-5 py-5">
              <div className="h-8 w-16 rounded bg-foreground/[0.06]" />
              <div className="h-3 w-20 rounded bg-foreground/[0.05]" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-border/70 bg-white p-5 sm:p-6">
        <div className="mb-5 h-5 w-32 rounded bg-foreground/[0.06]" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-2xl border border-border/70">
              <div className="h-40 bg-foreground/[0.05]" />
              <div className="space-y-2 p-6">
                <div className="h-4 w-3/4 rounded bg-foreground/[0.06]" />
                <div className="h-3 w-1/3 rounded bg-foreground/[0.05]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
