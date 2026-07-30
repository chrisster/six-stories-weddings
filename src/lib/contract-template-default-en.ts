import type { ContractTemplateSnapshot } from "@/lib/contracts";

/**
 * English cooperation agreement, as supplied by the studio.
 *
 * The company's own details are written out literally here rather than pulled
 * from organization_settings via merge fields. Those settings hold the Greek
 * forms ("Photoshooters O.E.", "Δ’ Θεσσαλονίκης"), and an English contract needs
 * the English rendering of the legal entity — which is a translation decision,
 * not something to derive automatically. Edit them in the template editor.
 *
 * {{client_party}} is composed in code so a company signer gets the
 * legal-entity wording instead of "the individual".
 */
export const DEFAULT_CONTRACT_TEMPLATE_EN: ContractTemplateSnapshot = {
  name: "Cooperation Agreement",
  version: 1,
  language: "en",
  title: "COOPERATION AGREEMENT",

  intro: [
    // "Thessaloniki" is written out rather than using {{place}}: that merge field
    // resolves from organization_settings, which holds the Greek form
    // ("Θεσσαλονίκη"), and would drop Greek into an otherwise English contract.
    "In Thessaloniki, today {{signed_date}}, the following contracting parties:",
    "A. On the one hand, the company Photoshooters G.P., headquartered in Thessaloniki at 38 Apostolou Pavlou Street, with Tax Identification Number (TIN) 801971850, registered at the 4th Tax Office of Thessaloniki, legally represented by Aristomenis Karampourniotis and Stergiopoulos Christos, hereinafter referred to as the “Company.”",
    "B. On the other hand, {{client_party}}, have mutually agreed and accepted the following:",
  ].join("\n\n"),

  clauses: [
    {
      heading: "1. SERVICES",
      body: "Under this agreement, the Company undertakes to provide the Client with the following service: provision of wedding photography and videography services, aimed at producing commemorative material for personal use. The above-mentioned services will commence and conclude on the date specified in the financial offer. The Client acknowledges the independent expertise and professional experience of the Company and agrees not to issue binding instructions or directions. However, the Client is entitled to provide directions and clarifications regarding the purposes of the collaboration, as well as to review the results of the execution of this agreement. The Company’s liability for any claim, breach, or damage shall be limited, in any case, to the amount paid by the Client under this agreement.",
    },
    {
      heading: "2. COMPENSATION",
      body: "For the above services, the fair and reasonable compensation shall be the amount specified in the financial offer. The services will be invoiced upon completion of the project, and payment must be made within fifteen (15) days from the invoice date to the Company’s business bank account. The compensation may be adjusted in the event of a change in the scope of work, including but not limited to the addition of new tasks or the expansion of already agreed services. Specifically, the fee for additional editing / post-production services is set at €40/hour. The Client is entitled to one (1) round of revisions on the delivered material. Any additional revisions will be charged at €40/hour. To begin the work, the Client must prepay an amount equal to 30% of the total project value to the Company’s business bank account, as a sign of mutual agreement and collaboration.",
    },
    {
      heading: "3. MATERIAL DELIVERY",
      body: "The Company will retain a copy of the final edited material for a period of up to one (1) year from the delivery date. Retention of the material for a longer period may be agreed upon at an additional fee of €50/year. The original files in raw format will be retained by the Company for a period of up to one (1) year from the delivery date of the final edited material. After this period has expired, the raw files may be permanently deleted by the Company. The Company must deliver the agreed material, according to the agreed schedule, via a digital link leading to files stored on the Company’s electronic platform. If additional time is required for delivery of the material, the Company must notify the Client in advance, request an extension, and agree on a new delivery date.",
    },
    {
      heading: "4. COPYRIGHTS",
      body: "The Client grants the Company the right to use selected photos and videos for promotional purposes, including use in portfolios, websites, and social media. The Client may request in writing to be excluded from the above use. According to Law 2121/1993, which protects the rights of intellectual creators, agreements concerning copyrights must be made in writing. Photographs are protected as original works, and any legal use of them by third parties requires the photographer’s authorization or the transfer of the relevant economic rights. Such authorization or transfer may only be granted by the photographer. Under this agreement, the Company grants the Client a license to use the produced photographic and videographic material for personal purposes, for an indefinite period of time. The Company is not obliged to deliver the original files in raw format, as these constitute part of the exercise of the photographer’s intellectual and moral rights over their work, in accordance with Articles 3 and 4 of Law 2121/1993. The Company may provide the original files to the Client for an additional fee, subject to a separate agreement.",
    },
    {
      heading: "5. OTHER TERMS",
      body: [
        "In the event of cancellation or postponement by the Client before the date of execution of the services, the deposit remains non-refundable, as it covers the preparation and scheduled reservation of the Company’s crew and resources. If the cancellation takes place less than fifteen (15) days before the scheduled date, the Client is obliged to pay an amount equal to 50% of the total agreed compensation, with any deposit already paid being offset against this amount. In the event of postponement, the deposit may be transferred to a new date, provided that the Company is available and a new schedule is agreed upon. If the new date cannot be accommodated by the Company, the deposit remains non-refundable. In the event of force majeure or other unforeseen circumstances beyond the control of the parties, neither party shall be liable for non-performance of its obligations, and the parties shall discuss in good faith a new date or another reasonable solution. If the Company is forced to cancel the project for such reasons, the deposit shall be fully refunded, unless otherwise agreed.",
        "The term of this agreement shall expire upon completion of the project, delivery of the material, and settlement of the related invoices. The courts of Thessaloniki shall have jurisdiction over any dispute arising from this agreement. Any amendment to this agreement may only be made in writing and with the consent of both parties.",
      ].join("\n\n"),
    },
  ],

  closing: "In confirmation of the above, this agreement was drafted and delivered to both parties.",

  consentText:
    "I confirm that I have read and accept the terms of this agreement, and I consent to signing and concluding it electronically.",
};
