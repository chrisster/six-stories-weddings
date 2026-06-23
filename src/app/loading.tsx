export default function AppLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
        Loading...
      </div>
    </main>
  );
}
