import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStudioUser } from "@/lib/auth";
import { getMediaObjectSize } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_FILES = 20_000;
const PAGE = 1000;

/** "IMG_0001.jpg" → "IMG_0001 (2).jpg", the first number not taken. */
function nextFreeName(name: string, taken: Set<string>) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})${extension}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

// Finds selected photos that are already in the gallery: same original file
// name and same byte size. The size lives in metadata_json.size for photos
// uploaded since this check exists; for older ones it is read from storage
// (only for name matches) and written back so the next check is instant.
//
// Answers each duplicate with the existing asset id (for "Replace") and a
// free name (for "Keep both") that collides with neither the gallery nor the
// rest of the selection.
export async function POST(request: Request) {
  try {
    if (!hasSupabaseEnv) {
      return NextResponse.json({ error: "Supabase env vars are missing." }, { status: 503 });
    }

    // A Supabase session alone is not enough: only studio members may use the
    // admin API.
    if (!(await getStudioUser())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      galleryId?: string;
      files?: Array<{ name?: string; size?: number }>;
    } | null;

    const galleryId = String(body?.galleryId || "").trim();
    const files = (Array.isArray(body?.files) ? body.files : []).map((file) => ({
      name: String(file?.name || "").trim(),
      size: Number(file?.size),
    }));

    if (!galleryId || files.length === 0 || files.length > MAX_FILES) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Admin client unavailable." }, { status: 500 });
    }

    // Every name in the gallery, paged past PostgREST's row cap. Names are
    // compared case-insensitively (camera exports differ only in case).
    type Row = { id: string; original_name: string | null; storage_path: string; metadata_json: unknown };
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("media_assets")
        .select("id, original_name, storage_path, metadata_json")
        .eq("gallery_id", galleryId)
        .eq("media_type", "photo")
        .order("sort_order", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      rows.push(...((data as Row[]) || []));
      if (!data || data.length < PAGE) break;
    }

    const byName = new Map<string, Row[]>();
    for (const row of rows) {
      if (!row.original_name) continue;
      const key = row.original_name.toLowerCase();
      byName.set(key, [...(byName.get(key) || []), row]);
    }

    const sizeOf = async (row: Row): Promise<number | null> => {
      const metadata = (row.metadata_json as Record<string, unknown> | null) || {};
      if (typeof metadata.size === "number") return metadata.size;
      const size = await getMediaObjectSize(row.storage_path);
      if (size !== null) {
        await admin
          .from("media_assets")
          .update({ metadata_json: { ...metadata, size } })
          .eq("id", row.id);
        metadata.size = size;
        row.metadata_json = metadata;
      }
      return size;
    };

    const taken = new Set<string>([
      ...byName.keys(),
      ...files.map((file) => file.name.toLowerCase()),
    ]);

    const duplicates: Array<{ index: number; mediaId: string; suggestedName: string }> = [];
    const claimed = new Set<string>();
    const matches = files
      .map((file, index) => ({ file, index, candidates: byName.get(file.name.toLowerCase()) }))
      .filter((match) => match.candidates && Number.isFinite(match.file.size));
    // Legacy rows need a storage HEAD each; keep at most 16 in flight.
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(16, matches.length) }, async () => {
        while (next < matches.length) {
          const { file, index, candidates } = matches[next++];
          for (const row of candidates!) {
            if ((await sizeOf(row)) === file.size && !claimed.has(row.id)) {
              claimed.add(row.id);
              duplicates.push({ index, mediaId: row.id, suggestedName: "" });
              break;
            }
          }
        }
      }),
    );

    // Suggested names are assigned in selection order so they read naturally.
    duplicates.sort((a, b) => a.index - b.index);
    for (const duplicate of duplicates) {
      const suggestedName = nextFreeName(files[duplicate.index].name, taken);
      taken.add(suggestedName.toLowerCase());
      duplicate.suggestedName = suggestedName;
    }

    return NextResponse.json({ duplicates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not check for duplicates.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
