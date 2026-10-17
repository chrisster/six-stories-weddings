import { respondToCrewRequestAction } from "@/app/crew/respond/[token]/actions";
import { crewRequestRows, getCrewRequestForToken, markCrewRequestSeen } from "@/lib/crew-requests";

export const dynamic = "force-dynamic";

type CrewRespondPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ answer?: string; error?: string }>;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div lang="el" className="min-h-screen bg-[#f3f1ee] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-xl">
        <p className="mb-6 text-center text-sm uppercase tracking-[0.24em] text-neutral-700">Six Stories</p>
        <div className="rounded-2xl border border-neutral-200 bg-white px-6 py-8 sm:px-9">{children}</div>
      </div>
    </div>
  );
}

export default async function CrewRespondPage({ params, searchParams }: CrewRespondPageProps) {
  const { token } = await params;
  const query = await searchParams;
  const details = await getCrewRequestForToken(token);

  if (!details) {
    return (
      <Shell>
        <h1 className="text-center text-lg font-medium text-neutral-900">Το link δεν είναι πλέον ενεργό</h1>
        <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-neutral-600">
          Η ανάθεση μπορεί να άλλαξε ή να αφαιρέθηκε. Επικοινώνησε με το studio αν χρειάζεσαι βοήθεια.
        </p>
      </Shell>
    );
  }

  // Opening the page is what counts as "seen". Answers only come from the
  // POST below, so link scanners in mail clients cannot accept or decline.
  await markCrewRequestSeen(details);

  const answered = details.status === "accepted" || details.status === "declined";
  const preferDecline = query.answer === "decline";
  const firstName = details.crewName.split(" ")[0];

  return (
    <Shell>
      <p className="text-center text-xs uppercase tracking-[0.2em] text-neutral-500">Διαθεσιμότητα</p>
      <h1 className="mt-2 text-center text-xl text-neutral-900">{details.projectTitle}</h1>

      <dl className="mt-6 divide-y divide-neutral-200 border-y border-neutral-200">
        {crewRequestRows(details).map(([label, value]) => (
          <div key={label} className="flex gap-4 py-2.5 text-sm">
            <dt className="w-28 shrink-0 text-xs uppercase tracking-[0.12em] text-neutral-500">{label}</dt>
            <dd className="text-neutral-900">{value}</dd>
          </div>
        ))}
      </dl>

      {query.error ? (
        <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Κάτι πήγε στραβά και η απάντηση δεν καταχωρήθηκε. Δοκίμασε ξανά.
        </p>
      ) : null}

      {answered ? (
        <div
          className={`mt-6 rounded-xl px-4 py-3 text-center text-sm ${
            details.status === "accepted" ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-700"
          }`}
        >
          {details.status === "accepted"
            ? "Ευχαριστούμε! Επιβεβαίωσες τη διαθεσιμότητά σου."
            : "Καταχωρήθηκε ότι δεν είσαι διαθέσιμος/η. Ευχαριστούμε που μας ενημέρωσες."}
        </div>
      ) : (
        <p className="mt-6 text-sm leading-relaxed text-neutral-600">
          {firstName ? `${firstName}, μπορείς` : "Μπορείς"} να είσαι μαζί μας; Αν θέλεις, άφησε και ένα σχόλιο.
        </p>
      )}

      <form action={respondToCrewRequestAction} className={answered ? "mt-5" : "mt-4"}>
        <input type="hidden" name="token" value={token} />
        {answered ? (
          <details className="text-center text-sm">
            <summary className="cursor-pointer text-neutral-500 underline underline-offset-2">Αλλαγή απάντησης</summary>
            <div className="mt-4 grid gap-3 text-left">
              <textarea
                name="note"
                rows={3}
                defaultValue={details.responseNote || ""}
                placeholder="Σχόλιο (προαιρετικό)"
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              />
              <AnswerButtons preferDecline={details.status === "accepted"} />
            </div>
          </details>
        ) : (
          <div className="grid gap-3">
            <textarea
              name="note"
              rows={3}
              placeholder="Σχόλιο (προαιρετικό)"
              autoFocus={preferDecline}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            />
            <AnswerButtons preferDecline={preferDecline} />
          </div>
        )}
      </form>
    </Shell>
  );
}

function AnswerButtons({ preferDecline }: { preferDecline: boolean }) {
  const strong = "h-11 rounded-xl border border-neutral-900 bg-neutral-900 px-4 text-sm text-white";
  const soft = "h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm text-neutral-800";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button type="submit" name="answer" value="accepted" className={preferDecline ? soft : strong}>
        Αποδοχή
      </button>
      <button type="submit" name="answer" value="declined" className={preferDecline ? strong : soft}>
        Δεν μπορώ
      </button>
    </div>
  );
}
