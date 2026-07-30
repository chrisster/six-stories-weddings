import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserRole } from "@/lib/auth";
import { getContractPdfBytes, logContractEvent } from "@/lib/contract-data";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serves the signed contract PDF to studio staff. Client copies go out as email
 * attachments and time-limited signed storage URLs, so this route is admin-only
 * and never exposes a guessable public link to signer personal data.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const role = await getCurrentUserRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const pdf = await getContractPdfBytes(id);
  if (!pdf) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await logContractEvent(id, "pdf_downloaded", {
    ip:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null,
    userAgent: request.headers.get("user-agent"),
  });

  return new NextResponse(new Uint8Array(pdf.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(pdf.filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
