import sharp from "sharp";

const MAX_WIDTH = 700;

/**
 * Turns a scanned stamp or signature into a transparent PNG suitable for
 * overlaying on a PDF signature line.
 *
 * Scanned stamps are dark ink on opaque white. Pasted as-is they paint a white
 * box over the signature rule, so alpha is derived from luminance rather than a
 * hard threshold: white becomes transparent, ink becomes opaque, and
 * anti-aliased edges keep their softness. The extremes are then flattened
 * because scanner noise across the background is invisible but defeats PNG
 * compression.
 */
export async function prepareSignatureImage(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);

  for (let i = 0; i < pixels.length; i += info.channels) {
    const luma = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    let alpha = Math.max(0, Math.min(255, Math.round(255 - luma)));

    if (alpha < 24) alpha = 0;
    else if (alpha > 205) alpha = 255;

    const existingAlpha = pixels[i + 3];
    pixels[i] = 0x14;
    pixels[i + 1] = 0x14;
    pixels[i + 2] = 0x14;
    pixels[i + 3] = Math.round((alpha * existingAlpha) / 255);
  }

  return sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .trim({ threshold: 1 })
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

/**
 * Stored as a data URI rather than a bucket URL so rendering a contract never
 * depends on an outbound HTTP fetch succeeding.
 */
export async function prepareSignatureDataUri(input: Buffer): Promise<string> {
  const png = await prepareSignatureImage(input);
  return `data:image/png;base64,${png.toString("base64")}`;
}
