import type {
  Contact,
  CrewMember,
  Gallery,
  GalleryDetail,
  GallerySection,
  MediaAsset,
  Project,
} from "@/lib/types";

const projectId = "demo-project-joost-stav";
const galleryId = "demo-gallery-joost-stav";

export const demoProject: Project = {
  id: projectId,
  title: "Joost & Stav Wedding",
  eventDate: "2026-05-23",
  month: "MAY",
  projectType: "Wedding Photo + Video",
  referral: "Six Stories Studio",
  packageCategory: "Premium",
  status: "scheduled",
  editingStatus: "in_progress",
  completed: false,
  budgetTotal: 3200,
  amountPaid: 1190.4,
  amountRemaining: 2009.6,
  notes: "Luxury island wedding. Couple requested cinematic edit with warm tones.",
  clients: [
    {
      id: "demo-client-joost",
      fullName: "Joost",
      email: "joost@example.com",
      phone: "+30 6900000001",
    },
    {
      id: "demo-client-stav",
      fullName: "Stav",
      email: "stav@example.com",
      phone: "+30 6900000002",
    },
  ],
  crewAssignments: [
    {
      id: "demo-assignment-1",
      projectId,
      crewMemberId: "demo-crew-chris",
      assignmentRole: "Lead Photographer",
      participantType: "inhouse" as const,
      freelancerFee: null,
      crewMember: {
        id: "demo-crew-chris",
        fullName: "Chris",
        roleType: "photographer",
      },
    },
    {
      id: "demo-assignment-2",
      projectId,
      crewMemberId: "demo-crew-ares",
      assignmentRole: "Videographer",
      participantType: "inhouse" as const,
      freelancerFee: null,
      crewMember: {
        id: "demo-crew-ares",
        fullName: "Ares",
        roleType: "videographer",
      },
    },
    {
      id: "demo-assignment-3",
      projectId,
      crewMemberId: "demo-crew-vicky",
      assignmentRole: "Editor",
      participantType: "inhouse" as const,
      freelancerFee: null,
      crewMember: {
        id: "demo-crew-vicky",
        fullName: "Vicky",
        roleType: "editor",
      },
    },
  ],
  tasks: [
    {
      id: "demo-task-1",
      projectId,
      title: "Pre-wedding planning call",
      status: "done",
      dueDate: "2026-05-15",
    },
    {
      id: "demo-task-2",
      projectId,
      title: "Backup footage and dual-drive archive",
      status: "done",
      dueDate: "2026-05-24",
    },
    {
      id: "demo-task-3",
      projectId,
      title: "First photo cull",
      status: "in_progress",
      dueDate: "2026-06-30",
    },
    {
      id: "demo-task-4",
      projectId,
      title: "Highlight film draft",
      status: "todo",
      dueDate: "2026-07-12",
    },
  ],
  deliverables: [
    {
      id: "demo-deliverable-1",
      projectId,
      deliverableType: "photos",
      status: "in_progress",
      dueDate: "2026-07-20",
    },
    {
      id: "demo-deliverable-2",
      projectId,
      deliverableType: "highlight_film",
      status: "pending",
      dueDate: "2026-08-01",
    },
    {
      id: "demo-deliverable-3",
      projectId,
      deliverableType: "teaser",
      status: "pending",
      dueDate: "2026-07-01",
    },
  ],
};

export const demoGallery: Gallery = {
  id: galleryId,
  projectId,
  slug: "joost-stav-2026",
  title: "Joost & Stav",
  isPublished: true,
  allowDownloads: false,
  hasPasscode: true,
  passcodeHash: null,
  coverMediaId: "demo-media-1",
};

export const demoGallerySections: GallerySection[] = [
  { id: "demo-section-1", galleryId, name: "Getting Ready", sortOrder: 1 },
  { id: "demo-section-2", galleryId, name: "Ceremony", sortOrder: 2 },
  { id: "demo-section-3", galleryId, name: "Couple Session", sortOrder: 3 },
  { id: "demo-section-4", galleryId, name: "Reception", sortOrder: 4 },
  { id: "demo-section-5", galleryId, name: "Party", sortOrder: 5 },
  { id: "demo-section-6", galleryId, name: "Films", sortOrder: 6 },
];

export const demoMediaAssets: MediaAsset[] = [
  {
    id: "demo-media-1",
    galleryId,
    sectionId: "demo-section-1",
    storagePath:
      "https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1200&q=80",
    mediaType: "photo",
    sortOrder: 1,
    isCover: true,
  },
  {
    id: "demo-media-2",
    galleryId,
    sectionId: "demo-section-2",
    storagePath:
      "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80",
    mediaType: "photo",
    sortOrder: 2,
    isCover: false,
  },
  {
    id: "demo-media-3",
    galleryId,
    sectionId: "demo-section-3",
    storagePath:
      "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80",
    mediaType: "photo",
    sortOrder: 3,
    isCover: false,
  },
  {
    id: "demo-media-4",
    galleryId,
    sectionId: "demo-section-6",
    storagePath: "https://www.w3schools.com/html/mov_bbb.mp4",
    mediaType: "video",
    sortOrder: 4,
    isCover: false,
  },
];

export const demoGalleryDetail: GalleryDetail = {
  gallery: demoGallery,
  project: demoProject,
  sections: demoGallerySections,
  mediaAssets: demoMediaAssets,
};

export const demoCrewMembersList: CrewMember[] = [
  { id: "demo-crew-chris", fullName: "Chris", roleType: "photographer", contactInfo: null },
  { id: "demo-crew-ares", fullName: "Ares", roleType: "videographer", contactInfo: null },
  { id: "demo-crew-vicky", fullName: "Vicky", roleType: "editor", contactInfo: null },
];

export const demoContacts: Contact[] = [
  {
    id: "demo-contact-1",
    fullName: "Ari & Niko",
    email: "ari.niko@example.com",
    phone: "+30 6900000011",
    eventDate: "2026-09-12",
    offerAmount: 4200,
    status: "offer_sent",
    notes: "Requested full-day coverage + drone ceremony shots.",
    createdAt: "2026-06-20T10:00:00Z",
  },
  {
    id: "demo-contact-2",
    fullName: "Mila & Theo",
    email: "mila.theo@example.com",
    phone: "+30 6900000012",
    eventDate: "2026-10-03",
    offerAmount: 3800,
    status: "confirmed",
    notes: "Awaiting contract signature this week.",
    createdAt: "2026-06-21T12:30:00Z",
  },
];