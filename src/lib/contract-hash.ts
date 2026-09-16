import { createHash } from "crypto";

/**
 * Kept apart from `contracts.ts` so that module stays free of Node built-ins:
 * the studio previews contracts in the browser with the same renderer the
 * signing page and the PDF use.
 */
export function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
