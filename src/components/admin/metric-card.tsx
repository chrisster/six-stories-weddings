type MetricCardProps = {
  label: string;
  value: string;
  hint?: string;
};

export function MetricCard({ label, value, hint }: MetricCardProps) {
  return (
    <article className="soft-panel p-5">
      <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </article>
  );
}