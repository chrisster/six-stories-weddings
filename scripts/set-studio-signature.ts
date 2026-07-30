/**
 * Prepares the studio stamp/signature image and stores it for contract
 * countersigning.
 *
 *   npx tsx --env-file=.env.local scripts/set-studio-signature.ts <image.png> [--dry]
 *
 * Scanned stamps arrive as dark ink on an opaque white background, which would
 * paint a white box over the signature line in the PDF. So instead of a naive
 * threshold, alpha is derived from luminance: white becomes fully transparent,
 * ink becomes fully opaque, and anti-aliased edges keep their softness.
 *
 * The result is stored as a data URI rather than a bucket URL, so rendering a
 * contract never depends on an outbound HTTP fetch succeeding.
 */
import { writeFileSync } from "fs";

import sharp from "sharp";

import { createAdminClient } from "@/lib/supabase/admin";
import { prepareSignatureImage } from "@/lib/signature-image";

async function prepare(src: string): Promise<Buffer> {
  const meta = await sharp(src).metadata();
  console.log(`Source: ${meta.width}×${meta.height} ${meta.format}, hasAlpha=${meta.hasAlpha}`);
  return prepareSignatureImage(await sharp(src).toBuffer());
}

async function main() {
  const src = process.argv[2];
  const dryRun = process.argv.includes("--dry");
  if (!src) throw new Error("Usage: set-studio-signature.ts <image.png> [--dry]");

  const png = await prepare(src);
  const out = await sharp(png).metadata();
  console.log(`Prepared: ${out.width}×${out.height}, ${(png.length / 1024).toFixed(1)} KB`);

  const preview = "/tmp/studio-signature-preview.png";
  writeFileSync(preview, png);
  console.log(`Preview written to ${preview}`);

  const dataUri = `data:image/png;base64,${png.toString("base64")}`;
  console.log(`Data URI length: ${(dataUri.length / 1024).toFixed(1)} KB`);

  if (dryRun) {
    console.log("\n--dry: database not modified.");
    return;
  }

  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase env vars missing — check .env.local");

  const { error } = await admin
    .from("organization_settings")
    .update({ signature_image_url: dataUri, updated_at: new Date().toISOString() })
    .eq("id", "default");

  if (error) throw new Error(error.message);
  console.log("\n✓ Stored as organization_settings.signature_image_url");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
