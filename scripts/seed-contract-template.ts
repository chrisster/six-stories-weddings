/**
 * Seeds the studio's contract templates from the defaults in
 * `src/lib/contract-template-default*.ts`.
 *
 *   npm run seed:contract-template          # insert if missing, leave existing alone
 *   npm run seed:contract-template -- --force  # overwrite wording from the defaults
 *
 * Existing templates are left untouched by default, so re-running this never
 * clobbers wording edited in the admin UI. Contracts already sent or signed keep
 * their own frozen snapshot either way.
 */
import { DEFAULT_CONTRACT_TEMPLATE } from "@/lib/contract-template-default";
import { DEFAULT_CONTRACT_TEMPLATE_EN } from "@/lib/contract-template-default-en";
import type { ContractTemplateSnapshot } from "@/lib/contracts";
import { createAdminClient } from "@/lib/supabase/admin";

const TEMPLATES: { snapshot: ContractTemplateSnapshot; makeDefault: boolean }[] = [
  { snapshot: DEFAULT_CONTRACT_TEMPLATE, makeDefault: true },
  { snapshot: DEFAULT_CONTRACT_TEMPLATE_EN, makeDefault: false },
];

async function main() {
  const force = process.argv.includes("--force");
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Supabase service role env vars are required. Check .env.local.");
  }

  for (const { snapshot, makeDefault } of TEMPLATES) {
    const { data: existing } = await admin
      .from("contract_templates")
      .select("id, version")
      .eq("name", snapshot.name)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload = {
      name: snapshot.name,
      language: snapshot.language,
      title: snapshot.title,
      intro: snapshot.intro,
      clauses: snapshot.clauses,
      closing: snapshot.closing,
      consent_text: snapshot.consentText,
      updated_at: new Date().toISOString(),
    };

    if (existing && !force) {
      console.log(
        `= "${snapshot.name}" (${snapshot.language}) already exists as v${existing.version} — skipped. Use --force to overwrite.`,
      );
      continue;
    }

    if (existing && force) {
      const { error } = await admin
        .from("contract_templates")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      console.log(
        `~ Overwrote "${snapshot.name}" (${snapshot.language}) v${existing.version} — ${snapshot.clauses.length} clauses.`,
      );
      continue;
    }

    const { data, error } = await admin
      .from("contract_templates")
      .insert({ ...payload, version: snapshot.version, is_active: false })
      .select("id, version")
      .single();
    if (error) throw new Error(error.message);
    console.log(
      `+ Created "${snapshot.name}" (${snapshot.language}) v${data.version} — ${snapshot.clauses.length} clauses.`,
    );
  }

  // Exactly one template is the default offered when sending. Only set it if
  // nothing is marked active yet, so an admin's choice is never overridden.
  const { data: active } = await admin
    .from("contract_templates")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!active) {
    const preferred = TEMPLATES.find((entry) => entry.makeDefault)?.snapshot.name;
    const { data: target } = await admin
      .from("contract_templates")
      .select("id, name")
      .eq("name", preferred ?? "")
      .maybeSingle();

    if (target) {
      await admin.from("contract_templates").update({ is_active: true }).eq("id", target.id);
      console.log(`\n★ "${target.name}" set as the default template.`);
    }
  } else {
    console.log("\n★ A default template is already set — left unchanged.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
