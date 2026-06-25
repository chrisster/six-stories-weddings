export type ProjectStatus =
  | "draft"
  | "negotiating"
  | "scheduled"
  | "post_production"
  | "completed"
  | "cancelled"
  | "declined";

export type Client = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

export type ClientPortalAccountSummary = {
  id: string;
  email: string;
  hasPassword: boolean;
  isActive: boolean;
  lastNotifiedAt?: string | null;
};

export type CrewMember = {
  id: string;
  fullName: string;
  roleType: "photographer" | "videographer" | "editor" | "assistant" | "partner";
  contactInfo?: string | null;
};

export type CrewAssignment = {
  id: string;
  projectId: string;
  crewMemberId: string;
  assignmentRole: string;
  participantType: "inhouse" | "freelancer";
  freelancerFee: number | null;
  notes?: string | null;
  crewMember: CrewMember;
};

export type ProjectTask = {
  id: string;
  projectId: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  dueDate?: string | null;
  assigneeId?: string | null;
};

export type Deliverable = {
  id: string;
  projectId: string;
  deliverableType: "photos" | "highlight_film" | "teaser" | "reel";
  status: "pending" | "in_progress" | "delivered";
  dueDate?: string | null;
  deliveredAt?: string | null;
  notes?: string | null;
};

export type ProjectPayment = {
  date: string;
  amount: number;
  note?: string;
};

export type Project = {
  id: string;
  title: string;
  eventDate: string;
  month: string;
  projectType: string;
  referral?: string | null;
  packageCategory?: string | null;
  status: ProjectStatus;
  completed: boolean;
  offerAmount: number;
  budgetTotal: number;
  amountPaid: number;
  amountRemaining: number;
  payments: ProjectPayment[];
  notes?: string | null;
  coverImageUrl?: string | null;
  clients: Client[];
  crewAssignments: CrewAssignment[];
  tasks: ProjectTask[];
  deliverables: Deliverable[];
};

export type Gallery = {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  isPublished: boolean;
  allowDownloads: boolean;
  hasPasscode: boolean;
  passcodeHash?: string | null;
  coverMediaId?: string | null;
};

export type GallerySection = {
  id: string;
  galleryId: string;
  name: string;
  sortOrder: number;
};

export type MediaAsset = {
  id: string;
  galleryId: string;
  sectionId?: string | null;
  storagePath: string;
  mediaType: "photo" | "video";
  sortOrder: number;
  isCover: boolean;
  originalName?: string | null;
};

export type GalleryDetail = {
  gallery: Gallery;
  project: Project;
  sections: GallerySection[];
  mediaAssets: MediaAsset[];
};

export type GalleryNotificationTemplate = {
  emailSubject: string;
  emailHeadline: string;
  emailIntro: string;
  emailBody: string;
  buttonLabel: string;
  shareNote: string;
  heroImageUrl?: string | null;
};

export type PortalGallery = {
  galleryId: string;
  projectId: string;
  slug: string;
  title: string;
  projectTitle: string;
  eventDate?: string | null;
  coverUrl?: string | null;
};

export type GuestGalleryLink = {
  id: string;
  token: string;
  createdAt: string;
  expiresAt?: string | null;
  isActive: boolean;
  accessCount: number;
  lastAccessedAt?: string | null;
};

export type ContactStatus =
  | "lead"
  | "offer_sent"
  | "confirmed"
  | "converted"
  | "rejected";

export type Contact = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  eventDate?: string | null;
  offerAmount?: number | null;
  status: ContactStatus;
  notes?: string | null;
  convertedClientId?: string | null;
  createdAt?: string;
};