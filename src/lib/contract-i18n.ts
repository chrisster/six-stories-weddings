/**
 * Copy for both contract languages.
 *
 * A contract's language comes from its template snapshot, so it is frozen at
 * send time along with the wording — an English contract keeps rendering in
 * English even if the studio later changes its default.
 */

export type ContractLanguage = "el" | "en";

export function normalizeLanguage(value: string | null | undefined): ContractLanguage {
  return String(value || "").toLowerCase().startsWith("en") ? "en" : "el";
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const EL_MONTHS = [
  "Ιανουαρίου", "Φεβρουαρίου", "Μαρτίου", "Απριλίου", "Μαΐου", "Ιουνίου",
  "Ιουλίου", "Αυγούστου", "Σεπτεμβρίου", "Οκτωβρίου", "Νοεμβρίου", "Δεκεμβρίου",
];

const EL_WEEKDAYS = [
  "Κυριακή", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο",
];

const EN_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const EN_WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/** "Τρίτη 12 Μαΐου 2026" / "Tuesday, 12 May 2026". */
export function formatContractDate(
  date: Date,
  language: ContractLanguage,
  withWeekday = true,
): string {
  const day = date.getDate();
  const year = date.getFullYear();

  if (language === "en") {
    const base = `${day} ${EN_MONTHS[date.getMonth()]} ${year}`;
    return withWeekday ? `${EN_WEEKDAYS[date.getDay()]}, ${base}` : base;
  }

  const base = `${day} ${EL_MONTHS[date.getMonth()]} ${year}`;
  return withWeekday ? `${EL_WEEKDAYS[date.getDay()]} ${base}` : base;
}

export function formatContractDateFromIso(
  iso: string | null | undefined,
  language: ContractLanguage,
  withWeekday = true,
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatContractDate(date, language, withWeekday);
}

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

type Strings = {
  // PDF
  companyLabel: string;
  clientLabel: string;
  auditTitle: string;
  auditContractId: string;
  auditSent: string;
  auditViewed: string;
  auditSigned: string;
  auditEmail: string;
  auditIp: string;
  auditBrowser: string;
  auditConsent: string;

  // Signing page
  toSign: string;
  autofillNote: string;
  legalNote: string;
  yourDetails: string;
  detailsNote: string;
  companyToggle: string;
  companyToggleHint: string;
  firstName: string;
  lastName: string;
  companyName: string;
  taxOffice: string;
  city: string;
  street: string;
  vatId: string;
  vatIdPlaceholder: string;
  signature: string;
  typeTab: string;
  drawTab: string;
  typePrompt: string;
  typedNote: string;
  drawPrompt: string;
  clear: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successClose: string;
  helpNote: string;

  // Notices
  invalidTitle: string;
  invalidBody: string;
  expiredTitle: string;
  expiredBody: string;
  signedTitle: string;
  signedBody: string;
  voidTitle: string;
  voidBody: string;

  // Validation
  errFirstName: string;
  errLastName: string;
  errCity: string;
  errStreet: string;
  errVatMissing: string;
  errVatInvalid: string;
  errCompanyName: string;
  errTaxOffice: string;
  errConsent: string;
  errDrawSignature: string;
  errSignatureTooLarge: string;
  errTypeSignature: string;
  errInvalidLink: string;
  errExpiredLink: string;
  errAlreadySigned: string;
  errVoided: string;

  // Emails
  emailGreeting: (name?: string | null) => string;
  inviteSubject: (title: string) => string;
  reminderSubject: (title: string) => string;
  inviteLead: (project?: string | null) => string;
  reminderLead: string;
  inviteHowTo: string;
  inviteButton: string;
  inviteExpiry: (date: string) => string;
  inviteCopyNote: string;
  inviteFallback: string;
  signedSubject: (title: string, project?: string | null) => string;
  signedHeadline: string;
  signedLead: (date: string) => string;
  signedKeep: string;
  signedButton: string;
  signedHash: string;
  successMessageEmailed: string;
  successMessagePending: string;
};

const EL: Strings = {
  companyLabel: "Η ΕΤΑΙΡΕΙΑ",
  clientLabel: "Ο ΠΕΛΑΤΗΣ",
  auditTitle: "ΣΤΟΙΧΕΙΑ ΗΛΕΚΤΡΟΝΙΚΗΣ ΥΠΟΓΡΑΦΗΣ",
  auditContractId: "Κωδικός συμβολαίου",
  auditSent: "Αποστολή",
  auditViewed: "Προβολή",
  auditSigned: "Υπογραφή",
  auditEmail: "Email",
  auditIp: "IP",
  auditBrowser: "Πρόγραμμα",
  auditConsent: "Συναίνεση",

  toSign: "Προς υπογραφή",
  autofillNote: "Τα στοιχεία σας συμπληρώνονται αυτόματα στο κείμενο μόλις υπογράψετε.",
  legalNote:
    "Η ηλεκτρονική υπογραφή είναι νομικά δεσμευτική. Καταγράφονται η ημερομηνία και ώρα, η διεύθυνση IP και το πρόγραμμα περιήγησής σας ως αποδεικτικά στοιχεία.",
  yourDetails: "Τα στοιχεία σας",
  detailsNote: "Θα συμπληρωθούν στο συμφωνητικό. Το email σας καταγράφεται αυτόματα.",
  companyToggle: "Υπογράφω για λογαριασμό εταιρείας",
  companyToggleHint: "Αφήστε το κενό αν υπογράφετε ως ιδιώτης.",
  firstName: "Όνομα",
  lastName: "Επώνυμο",
  companyName: "Επωνυμία εταιρείας",
  taxOffice: "Δ.Ο.Υ.",
  city: "Πόλη",
  street: "Οδός & αριθμός",
  vatId: "ΑΦΜ",
  vatIdPlaceholder: "9 ψηφία",
  signature: "Υπογραφή",
  typeTab: "Πληκτρολόγηση",
  drawTab: "Σχέδιο",
  typePrompt: "Γράψτε το ονοματεπώνυμό σας",
  typedNote: "Η πληκτρολογημένη υπογραφή έχει την ίδια νομική ισχύ με τη σχεδιασμένη.",
  drawPrompt: "Υπογράψτε εδώ με το δάχτυλο ή το ποντίκι",
  clear: "Καθαρισμός",
  submit: "Υπογραφή συμφωνητικού",
  submitting: "Υπογραφή…",
  successTitle: "Το συμφωνητικό υπογράφηκε",
  successClose: "Μπορείτε να κλείσετε αυτή τη σελίδα.",
  helpNote: "Για οποιαδήποτε απορία, απαντήστε στο email που λάβατε.",

  invalidTitle: "Ο σύνδεσμος δεν είναι έγκυρος",
  invalidBody:
    "Ο σύνδεσμος υπογραφής δεν βρέθηκε. Ελέγξτε ότι χρησιμοποιείτε τον πιο πρόσφατο σύνδεσμο από το email σας.",
  expiredTitle: "Ο σύνδεσμος έχει λήξει",
  expiredBody:
    "Για ασφάλεια, ο σύνδεσμος υπογραφής ισχύει για περιορισμένο διάστημα. Επικοινωνήστε μαζί μας για να σας στείλουμε νέο.",
  signedTitle: "Το συμφωνητικό έχει υπογραφεί",
  signedBody: "Αυτό το συμφωνητικό έχει ήδη υπογραφεί. Αντίγραφο σε PDF έχει σταλεί στο email σας.",
  voidTitle: "Το συμφωνητικό ακυρώθηκε",
  voidBody: "Αυτό το συμφωνητικό δεν είναι πλέον ενεργό. Επικοινωνήστε μαζί μας για περισσότερες πληροφορίες.",

  errFirstName: "Συμπληρώστε το όνομά σας.",
  errLastName: "Συμπληρώστε το επώνυμό σας.",
  errCity: "Συμπληρώστε την πόλη σας.",
  errStreet: "Συμπληρώστε τη διεύθυνσή σας.",
  errVatMissing: "Συμπληρώστε το ΑΦΜ σας.",
  errVatInvalid: "Το ΑΦΜ δεν είναι έγκυρο. Ελέγξτε τα 9 ψηφία.",
  errCompanyName: "Συμπληρώστε την επωνυμία της εταιρείας.",
  errTaxOffice: "Συμπληρώστε τη Δ.Ο.Υ.",
  errConsent: "Απαιτείται η συναίνεσή σας για την ηλεκτρονική υπογραφή.",
  errDrawSignature: "Σχεδιάστε την υπογραφή σας.",
  errSignatureTooLarge: "Η υπογραφή είναι πολύ μεγάλη.",
  errTypeSignature: "Γράψτε το ονοματεπώνυμό σας.",
  errInvalidLink: "Ο σύνδεσμος δεν είναι έγκυρος.",
  errExpiredLink: "Ο σύνδεσμος έχει λήξει. Ζητήστε νέο.",
  errAlreadySigned: "Το συμβόλαιο έχει ήδη υπογραφεί.",
  errVoided: "Το συμβόλαιο έχει ακυρωθεί.",

  emailGreeting: (name) => (name ? `Αγαπητέ/ή ${name},` : "Καλησπέρα σας,"),
  inviteSubject: (title) => `${title} προς υπογραφή`,
  reminderSubject: (title) => `Υπενθύμιση: ${title} προς υπογραφή`,
  inviteLead: (project) =>
    `Σας αποστέλλουμε το συμφωνητικό συνεργασίας${project ? ` για «${project}»` : ""} προς υπογραφή.`,
  reminderLead: "Υπενθύμιση: το συμφωνητικό συνεργασίας σας αναμένει ακόμη την υπογραφή σας.",
  inviteHowTo:
    "Η υπογραφή γίνεται ηλεκτρονικά, μέσα από τον παρακάτω σύνδεσμο. Θα σας ζητηθεί να συμπληρώσετε το ονοματεπώνυμο, την πόλη και τη διεύθυνσή σας, το ΑΦΜ σας και να υπογράψετε.",
  inviteButton: "Άνοιγμα & υπογραφή",
  inviteExpiry: (date) =>
    `Ο σύνδεσμος είναι προσωπικός και ισχύει έως ${date}. Μην τον προωθήσετε σε τρίτους.`,
  inviteCopyNote:
    "Μόλις υπογράψετε, θα λάβετε αυτόματα αντίγραφο του υπογεγραμμένου συμφωνητικού σε PDF.",
  inviteFallback: "Αν ο σύνδεσμος δεν ανοίγει, αντιγράψτε τον στο πρόγραμμα περιήγησής σας:",
  signedSubject: (title, project) => `Υπογεγραμμένο: ${title}${project ? ` — ${project}` : ""}`,
  signedHeadline: "Υπογεγραμμένο συμφωνητικό",
  signedLead: (date) =>
    `Το συμφωνητικό υπογράφηκε ηλεκτρονικά στις ${date}. Επισυνάπτεται αντίγραφο σε PDF, υπογεγραμμένο από τα δύο μέρη.`,
  signedKeep: "Παρακαλούμε φυλάξτε το αρχείο για το αρχείο σας.",
  signedButton: "Λήψη PDF",
  signedHash: "Κωδικός ακεραιότητας αρχείου (SHA-256):",
  successMessageEmailed: "Το συμφωνητικό υπογράφηκε. Αντίγραφο σε PDF στάλθηκε στο email σας.",
  successMessagePending: "Το συμφωνητικό υπογράφηκε. Θα λάβετε σύντομα αντίγραφο σε PDF.",
};

const EN: Strings = {
  companyLabel: "THE COMPANY",
  clientLabel: "THE CLIENT",
  auditTitle: "ELECTRONIC SIGNATURE RECORD",
  auditContractId: "Contract ID",
  auditSent: "Sent",
  auditViewed: "Viewed",
  auditSigned: "Signed",
  auditEmail: "Email",
  auditIp: "IP",
  auditBrowser: "Browser",
  auditConsent: "Consent",

  toSign: "For signature",
  autofillNote: "Your details are filled into the agreement automatically when you sign.",
  legalNote:
    "This electronic signature is legally binding. The date and time, your IP address, and your browser are recorded as supporting evidence.",
  yourDetails: "Your details",
  detailsNote: "These are filled into the agreement. Your email address is recorded automatically.",
  companyToggle: "I am signing on behalf of a company",
  companyToggleHint: "Leave unticked if you are signing as an individual.",
  firstName: "First name",
  lastName: "Last name",
  companyName: "Company name",
  taxOffice: "Tax office",
  city: "City",
  street: "Street & number",
  vatId: "Tax ID (TIN)",
  vatIdPlaceholder: "9 digits",
  signature: "Signature",
  typeTab: "Type",
  drawTab: "Draw",
  typePrompt: "Type your full name",
  typedNote: "A typed signature carries the same legal weight as a drawn one.",
  drawPrompt: "Sign here with your finger or mouse",
  clear: "Clear",
  submit: "Sign agreement",
  submitting: "Signing…",
  successTitle: "Agreement signed",
  successClose: "You can close this page.",
  helpNote: "If you have any questions, simply reply to the email you received.",

  invalidTitle: "This link is not valid",
  invalidBody:
    "The signing link could not be found. Please check that you are using the most recent link from your email.",
  expiredTitle: "This link has expired",
  expiredBody:
    "For security, signing links are valid for a limited time. Please contact us and we will send you a new one.",
  signedTitle: "This agreement has been signed",
  signedBody: "This agreement has already been signed. A PDF copy has been sent to your email address.",
  voidTitle: "This agreement was cancelled",
  voidBody: "This agreement is no longer active. Please contact us for more information.",

  errFirstName: "Please enter your first name.",
  errLastName: "Please enter your last name.",
  errCity: "Please enter your city.",
  errStreet: "Please enter your address.",
  errVatMissing: "Please enter your Tax ID.",
  errVatInvalid: "That Tax ID is not valid. Please check the 9 digits.",
  errCompanyName: "Please enter the company name.",
  errTaxOffice: "Please enter the tax office.",
  errConsent: "Your consent is required in order to sign electronically.",
  errDrawSignature: "Please draw your signature.",
  errSignatureTooLarge: "That signature is too large.",
  errTypeSignature: "Please type your full name.",
  errInvalidLink: "This link is not valid.",
  errExpiredLink: "This link has expired. Please request a new one.",
  errAlreadySigned: "This agreement has already been signed.",
  errVoided: "This agreement was cancelled.",

  emailGreeting: (name) => (name ? `Dear ${name},` : "Hello,"),
  inviteSubject: (title) => `${title} for signature`,
  reminderSubject: (title) => `Reminder: ${title} awaiting your signature`,
  inviteLead: (project) =>
    `Please find our cooperation agreement${project ? ` for "${project}"` : ""} for your signature.`,
  reminderLead: "A reminder that our cooperation agreement is still awaiting your signature.",
  inviteHowTo:
    "Signing is done online, through the link below. You will be asked for your full name, city and address, your Tax ID, and your signature.",
  inviteButton: "Open & sign",
  inviteExpiry: (date) =>
    `This link is personal to you and valid until ${date}. Please do not forward it.`,
  inviteCopyNote:
    "Once you have signed, you will automatically receive a PDF copy of the signed agreement.",
  inviteFallback: "If the link does not open, copy it into your browser:",
  signedSubject: (title, project) => `Signed: ${title}${project ? ` — ${project}` : ""}`,
  signedHeadline: "Signed agreement",
  signedLead: (date) =>
    `This agreement was signed electronically on ${date}. A PDF copy, executed by both parties, is attached.`,
  signedKeep: "Please keep the file for your records.",
  signedButton: "Download PDF",
  signedHash: "File integrity checksum (SHA-256):",
  successMessageEmailed: "The agreement is signed. A PDF copy has been sent to your email address.",
  successMessagePending: "The agreement is signed. You will receive a PDF copy shortly.",
};

export function strings(language: ContractLanguage): Strings {
  return language === "en" ? EN : EL;
}
