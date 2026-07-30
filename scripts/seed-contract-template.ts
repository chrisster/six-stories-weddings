/**
 * Seeds (or re-versions) the studio's contract template from
 * `src/lib/contract-template-default.ts`.
 *
 *   npx tsx scripts/seed-contract-template.ts
 *
 * Running it again when the default has changed inserts a NEW version and makes
 * it active, leaving older versions in place — contracts already signed keep
 * their own frozen snapshot regardless.
 */
import { DEFAULT_CONTRACT_TEMPLATE } from "@/lib/contract-template-default";
import { createAdminClient } from "@/lib/supabase/admin";

async function main() {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Supabase service role env vars are required. Check .env.local.");
  }

  const template = DEFAULT_CONTRACT_TEMPLATE;

  const { data: existing } = await admin
    .from("contract_templates")
    .select("id, version")
    .eq("name", template.name)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = existing ? Number(existing.version) + 1 : template.version;

  // Only one template may be active at a time.
  await admin
    .from("contract_templates")
    .update({ is_active: false })
    .eq("name", template.name);

  const { data, error } = await admin
    .from("contract_templates")
    .insert({
      name: template.name,
      version,
      language: template.language,
      title: template.title,
      intro: template.intro,
      clauses: template.clauses,
      closing: template.closing,
      consent_text: template.consentText,
      is_active: true,
    })
    .select("id, name, version")
    .single();

  if (error) throw new Error(error.message);

  console.log(
    `Seeded template "${data.name}" v${data.version} (${data.id}) with ${template.clauses.length} clauses — now active.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
