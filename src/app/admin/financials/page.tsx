import { getProjects } from "@/lib/data";
import { formatDateDDMMYY } from "@/lib/utils";

type FinancialsPageProps = {
  searchParams: Promise<{ period?: string }>;
};

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function isWithinPeriod(eventDate: string, period: string) {
  if (period === "all") return true;
  if (!eventDate) return false;

  const date = new Date(`${eventDate}T00:00:00Z`);
  const now = new Date();

  if (period === "this_month") {
    return (
      date.getUTCFullYear() === now.getUTCFullYear() &&
      date.getUTCMonth() === now.getUTCMonth()
    );
  }

  if (period === "this_year") {
    return date.getUTCFullYear() === now.getUTCFullYear();
  }

  return true;
}

const periodOptions = [
  { key: "all", label: "All time" },
  { key: "this_month", label: "This month" },
  { key: "this_year", label: "This year" },
] as const;

const inactiveStatuses = new Set(["cancelled", "declined"]);

export default async function FinancialsPage({ searchParams }: FinancialsPageProps) {
  const params = await searchParams;
  const period = params.period || "all";

  const projects = await getProjects();
  const scoped = projects
    .filter((project) => isWithinPeriod(project.eventDate, period))
    .filter((project) => !inactiveStatuses.has(project.status));

  const rows = scoped
    .map((project) => {
      const paidFromPayments = project.payments.reduce((sum, payment) => sum + payment.amount, 0);
      const collected = project.payments.length > 0 ? paidFromPayments : project.amountPaid;
      const income = project.offerAmount || project.budgetTotal || 0;
      const outstanding = Math.max(0, income - collected);
      const expenses = project.crewAssignments
        .filter((assignment) => assignment.participantType === "freelancer")
        .reduce((sum, assignment) => sum + (assignment.freelancerFee || 0), 0);
      const net = income - expenses;

      return {
        id: project.id,
        title: project.title,
        eventDate: project.eventDate,
        status: project.status,
        income,
        collected,
        outstanding,
        expenses,
        net,
      };
    })
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));

  const totals = rows.reduce(
    (acc, row) => {
      acc.income += row.income;
      acc.collected += row.collected;
      acc.outstanding += row.outstanding;
      acc.expenses += row.expenses;
      acc.net += row.net;
      return acc;
    },
    { income: 0, collected: 0, outstanding: 0, expenses: 0, net: 0 },
  );

  const freelancerTotals = new Map<string, { name: string; total: number; count: number }>();
  scoped.forEach((project) => {
    project.crewAssignments
      .filter((assignment) => assignment.participantType === "freelancer")
      .forEach((assignment) => {
        const key = assignment.crewMemberId || assignment.crewMember.fullName;
        const current = freelancerTotals.get(key) || {
          name: assignment.crewMember.fullName || "Unnamed freelancer",
          total: 0,
          count: 0,
        };
        current.total += assignment.freelancerFee || 0;
        current.count += 1;
        freelancerTotals.set(key, current);
      });
  });

  const freelancers = Array.from(freelancerTotals.values()).sort((a, b) => b.total - a.total);

  const margin = totals.income > 0 ? Math.round((totals.net / totals.income) * 100) : 0;

  const kpis = [
    { label: "Income (offers)", value: currency(totals.income), hint: "Sum of project offers" },
    { label: "Expenses (freelancers)", value: currency(totals.expenses), hint: "Fees paid to freelance crew" },
    { label: "Net", value: currency(totals.net), hint: `${margin}% margin` },
    { label: "Collected", value: currency(totals.collected), hint: "Payments received" },
    { label: "Outstanding", value: currency(totals.outstanding), hint: "Still to be collected" },
  ];

  return (
    <div className="space-y-6">
      <section className="soft-panel p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.25em] text-muted-foreground uppercase">Studio</p>
            <h2 className="title-cinematic mt-2 text-3xl font-semibold">Financials</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Income comes from project offers. Expenses are fees paid to freelance crew.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {periodOptions.map((option) => {
              const isActive = option.key === period;
              return (
                <a
                  key={option.key}
                  href={`/admin/financials?period=${option.key}`}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    isActive
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {option.label}
                </a>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-2xl border border-border/80 bg-zinc-50 p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{kpi.label}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{kpi.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="soft-panel overflow-hidden p-0">
        <div className="border-b border-border/80 px-5 py-4">
          <h3 className="text-sm tracking-[0.2em] text-muted-foreground uppercase">By project</h3>
        </div>

        {rows.length > 0 ? (
          <>
            <div className="hidden border-b border-border/80 bg-zinc-50 px-5 py-3 text-xs tracking-[0.12em] text-muted-foreground uppercase sm:grid sm:grid-cols-[1.4fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr]">
              <p>Project</p>
              <p className="text-right">Income</p>
              <p className="text-right">Collected</p>
              <p className="text-right">Outstanding</p>
              <p className="text-right">Expenses</p>
              <p className="text-right">Net</p>
            </div>
            <ul>
              {rows.map((row) => (
                <li key={row.id} className="border-b border-border/70 px-5 py-4 last:border-0">
                  <div className="grid gap-2 sm:grid-cols-[1.4fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr] sm:items-center">
                    <div className="min-w-0">
                      <a href={`/admin/projects/${row.id}`} className="text-sm font-medium text-foreground hover:underline">
                        {row.title}
                      </a>
                      <p className="text-xs text-muted-foreground">{formatDateDDMMYY(row.eventDate)}</p>
                    </div>
                    <p className="text-sm text-foreground sm:text-right">{currency(row.income)}</p>
                    <p className="text-sm text-muted-foreground sm:text-right">{currency(row.collected)}</p>
                    <p className="text-sm text-muted-foreground sm:text-right">{currency(row.outstanding)}</p>
                    <p className="text-sm text-amber-700 sm:text-right">{currency(row.expenses)}</p>
                    <p className={`text-sm font-medium sm:text-right ${row.net < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                      {currency(row.net)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="grid gap-2 border-t border-border/80 bg-zinc-50 px-5 py-3 text-sm font-medium sm:grid-cols-[1.4fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr] sm:items-center">
              <p className="text-xs tracking-[0.12em] text-muted-foreground uppercase">Totals</p>
              <p className="sm:text-right">{currency(totals.income)}</p>
              <p className="sm:text-right">{currency(totals.collected)}</p>
              <p className="sm:text-right">{currency(totals.outstanding)}</p>
              <p className="text-amber-700 sm:text-right">{currency(totals.expenses)}</p>
              <p className={`sm:text-right ${totals.net < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                {currency(totals.net)}
              </p>
            </div>
          </>
        ) : (
          <p className="px-5 py-6 text-sm text-muted-foreground">No financial data for this period.</p>
        )}
      </section>

      <section className="soft-panel p-5">
        <h3 className="mb-3 text-sm tracking-[0.2em] text-muted-foreground uppercase">Freelancer expenses</h3>
        {freelancers.length > 0 ? (
          <ul className="space-y-2">
            {freelancers.map((freelancer) => (
              <li
                key={freelancer.name}
                className="flex items-center justify-between rounded-xl border border-border/70 bg-zinc-50 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{freelancer.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {freelancer.count} {freelancer.count === 1 ? "assignment" : "assignments"}
                  </p>
                </div>
                <p className="text-sm font-medium text-amber-700">{currency(freelancer.total)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No freelancer expenses for this period.</p>
        )}
      </section>
    </div>
  );
}
