import type { RenderedContract } from "@/lib/contracts";

/**
 * On-screen rendering of a contract. Deliberately mirrors the PDF layout in
 * `contract-pdf.tsx` so what the client reads before signing is what the signed
 * artifact says — both are driven from the same `RenderedContract`.
 */
export function ContractBody({ rendered }: { rendered: RenderedContract }) {
  return (
    <article className="font-serif text-[13px] leading-relaxed text-neutral-800">
      <h1 className="mb-5 text-center text-base font-bold tracking-[0.14em] text-neutral-900">
        {rendered.title}
      </h1>

      {rendered.intro.map((paragraph, index) => (
        <p key={`intro-${index}`} className="mb-2 text-justify">
          {paragraph}
        </p>
      ))}

      {rendered.clauses.map((clause, clauseIndex) => (
        <section key={`clause-${clauseIndex}`} className="mt-4">
          <h2 className="mb-1.5 text-[13px] font-bold tracking-[0.08em] text-neutral-900">
            {clause.heading}
          </h2>
          {clause.paragraphs.map((paragraph, index) => (
            <p key={`clause-${clauseIndex}-${index}`} className="mb-2 text-justify">
              {paragraph}
            </p>
          ))}
        </section>
      ))}

      {rendered.closing.map((paragraph, index) => (
        <p key={`closing-${index}`} className="mt-4 text-justify">
          {paragraph}
        </p>
      ))}
    </article>
  );
}
