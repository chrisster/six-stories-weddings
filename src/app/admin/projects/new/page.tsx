import { NewWeddingForm } from "@/components/admin/new-wedding-form";
import { getContacts, getCrewMembers } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NewWeddingPage() {
  const [contacts, crewMembers] = await Promise.all([getContacts(), getCrewMembers()]);

  return (
    <div className="space-y-4">
      <div className="soft-panel p-5">
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">New Project</p>
        <h2 className="title-cinematic mt-1 text-3xl font-semibold">Create Project</h2>
      </div>
      <NewWeddingForm contacts={contacts} crewMembers={crewMembers} />
    </div>
  );
}
