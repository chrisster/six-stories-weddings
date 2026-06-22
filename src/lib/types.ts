export type ProjectStatus = "confirmed" | "unconfirmed" | "cancelled";
export type EditingStatus = "not_started" | "in_progress" | "review" | "completed";

export type Client = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

export type CrewMember = {
  id: string;
  fullName: string;
  roleType: "photographer" | "videographer" | "editor" | "assistant";
  contactInfo?: string | null;
};

export type CrewAssignment = {
  id: string;
  projectId: string;
  crewMemberId: string;
  assignmentRole: string;
  notes?: string | null;
  crewMember: CrewMember;
};

export type ProjectTask = {
  id: string;
  projectId: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  dueDate?: string | null;
  priority: "low" | "medium" | "high";
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

export type Project = {
  id: string;
  title: string;
  eventDate: string;
  month: string;
  projectType: string;
  referral?: string | null;
  packageCategory?: string | null;
  status: ProjectStatus;
  editingStatus: EditingStatus;
  completed: boolean;
  budgetTotal: number;
  amountPaid: number;
  amountRemaining: number;
  notes?: string | null;
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
};

export type GalleryDetail = {
  gallery: Gallery;
  project: Project;
  sections: GallerySection[];
  mediaAssets: MediaAsset[];
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