import path from "path";

import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { strings, type ContractLanguage } from "@/lib/contract-i18n";
import type { RenderedContract } from "@/lib/contracts";

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------
// react-pdf's built-in Helvetica has no Greek glyphs — Greek text renders as
// blank boxes. DejaVu Serif covers the Greek and Coptic block, so register it
// once per process and use it for everything.

let fontsRegistered = false;

function registerFonts() {
  if (fontsRegistered) return;

  const dir = path.join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf");
  Font.register({
    family: "DejaVuSerif",
    fonts: [
      { src: path.join(dir, "DejaVuSerif.ttf"), fontWeight: "normal" },
      { src: path.join(dir, "DejaVuSerif-Bold.ttf"), fontWeight: "bold" },
    ],
  });

  // Greek has no hyphenation dictionary here; returning the word unsplit avoids
  // react-pdf breaking Greek words at arbitrary points.
  Font.registerHyphenationCallback((word) => [word]);

  fontsRegistered = true;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    paddingTop: 46,
    paddingBottom: 56,
    paddingHorizontal: 52,
    fontFamily: "DejaVuSerif",
    fontSize: 8.5,
    lineHeight: 1.5,
    color: "#1a1a1a",
  },
  title: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "center",
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  intro: {
    marginBottom: 4,
    textAlign: "justify",
  },
  clause: { marginTop: 8 },
  heading: {
    fontSize: 9.5,
    fontWeight: "bold",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  paragraph: {
    marginBottom: 3,
    textAlign: "justify",
  },
  closing: { marginTop: 10, textAlign: "justify" },

  signatureRow: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureBlock: { width: "45%" },
  signatureLabel: {
    fontSize: 8.5,
    fontWeight: "bold",
    marginBottom: 4,
  },
  signatureImage: {
    height: 40,
    marginBottom: 2,
    objectFit: "contain",
    objectPositionX: 0,
  },
  // The studio stamp is a wide text block (roughly 2.7:1), so it is sized by
  // width to fill the signature column instead of being pinned by height.
  stampImage: {
    width: 160,
    height: 59,
    // Slightly more clearance than a signature needs, so the stamp's last line
    // does not sit directly on the rule.
    marginBottom: 6,
    objectFit: "contain",
    objectPositionX: 0,
  },
  typedSignature: {
    fontSize: 13,
    marginBottom: 2,
    marginTop: 12,
  },
  signatureRule: {
    borderTopWidth: 0.7,
    borderTopColor: "#333333",
    paddingTop: 3,
  },
  signatureMeta: { fontSize: 6.5, color: "#555555", lineHeight: 1.4 },

  auditBox: {
    marginTop: 14,
    padding: 7,
    borderWidth: 0.6,
    borderColor: "#bbbbbb",
    backgroundColor: "#f7f7f7",
  },
  auditTitle: {
    fontSize: 6.8,
    fontWeight: "bold",
    marginBottom: 2.5,
    letterSpacing: 0.4,
  },
  auditLine: { fontSize: 6.2, color: "#444444", lineHeight: 1.45 },

  pageNumber: {
    position: "absolute",
    bottom: 24,
    left: 52,
    right: 52,
    textAlign: "center",
    fontSize: 6.5,
    color: "#888888",
  },
});

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export type ContractPdfInput = {
  rendered: RenderedContract;
  language: ContractLanguage;
  /** Studio side. */
  studioLabel: string;
  studioName: string;
  studioSignatureUrl?: string | null;
  /** Client side. */
  clientLabel: string;
  clientName: string;
  signatureKind: "drawn" | "typed" | null;
  /** PNG data URL when drawn, the typed name when typed. */
  signatureData: string | null;
  /** Audit trail — omitted entirely while the contract is unsigned. */
  audit?: {
    contractId: string;
    signedAtLabel: string;
    signerEmail: string;
    ip: string;
    userAgent: string;
    consentText: string;
    sentAtLabel: string;
    viewedAtLabel: string;
  } | null;
};

function ContractDocument(input: ContractPdfInput) {
  const { rendered, audit } = input;
  const t = strings(input.language);

  return (
    <Document
      title={rendered.title}
      author={input.studioName}
      subject={rendered.title}
      creator="Six Stories Studio"
      producer="Six Stories Studio"
    >
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.title}>{rendered.title}</Text>

        {rendered.intro.map((paragraph, index) => (
          <Text key={`intro-${index}`} style={styles.intro}>
            {paragraph}
          </Text>
        ))}

        {/*
          Clauses wrap freely — pinning a whole clause with wrap={false} pushes
          long ones to the next page and leaves a third of a page blank. Instead
          minPresenceAhead keeps a heading from being orphaned at a page break.
        */}
        {rendered.clauses.map((clause, clauseIndex) => (
          <View key={`clause-${clauseIndex}`} style={styles.clause}>
            <Text style={styles.heading} minPresenceAhead={46}>
              {clause.heading}
            </Text>
            {clause.paragraphs.map((paragraph, index) => (
              <Text key={`clause-${clauseIndex}-${index}`} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}

        {rendered.closing.map((paragraph, index) => (
          <Text key={`closing-${index}`} style={styles.closing}>
            {paragraph}
          </Text>
        ))}

        <View style={styles.signatureRow} wrap={false}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>{input.studioLabel}</Text>
            {input.studioSignatureUrl ? (
              // react-pdf's <Image> is a PDF primitive, not a DOM <img> — it has
              // no alt prop, so the jsx-a11y rule does not apply here.
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={input.studioSignatureUrl} style={styles.stampImage} />
            ) : (
              <Text style={styles.typedSignature}> </Text>
            )}
            <View style={styles.signatureRule}>
              <Text style={styles.signatureMeta}>{input.studioName}</Text>
            </View>
          </View>

          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>{input.clientLabel}</Text>
            {input.signatureKind === "drawn" && input.signatureData ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={input.signatureData} style={styles.signatureImage} />
            ) : (
              <Text style={styles.typedSignature}>{input.signatureData || " "}</Text>
            )}
            <View style={styles.signatureRule}>
              <Text style={styles.signatureMeta}>{input.clientName}</Text>
            </View>
          </View>
        </View>

        {audit ? (
          <View style={styles.auditBox} wrap={false}>
            <Text style={styles.auditTitle}>{t.auditTitle}</Text>
            <Text style={styles.auditLine}>
              {t.auditContractId}: {audit.contractId}
            </Text>
            <Text style={styles.auditLine}>
              {t.auditSent}: {audit.sentAtLabel} · {t.auditViewed}: {audit.viewedAtLabel}
            </Text>
            <Text style={styles.auditLine}>
              {t.auditSigned}: {audit.signedAtLabel} · {t.auditEmail}: {audit.signerEmail}
            </Text>
            <Text style={styles.auditLine}>
              {t.auditIp}: {audit.ip} · {t.auditBrowser}: {audit.userAgent}
            </Text>
            <Text style={styles.auditLine}>
              {t.auditConsent}: “{audit.consentText}”
            </Text>
          </View>
        ) : null}

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

/** Renders the contract to PDF bytes. Node runtime only. */
export async function renderContractPdf(input: ContractPdfInput): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ContractDocument {...input} />);
}
