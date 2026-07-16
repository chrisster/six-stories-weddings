import { NextResponse } from "next/server";

import { getGoogleMapsApiKey } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Suggestion = { label: string };

async function fetchFromGoogle(query: string, apiKey: string): Promise<Suggestion[]> {
  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify({ input: query }),
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as {
    suggestions?: Array<{ placePrediction?: { text?: { text?: string } } }>;
  };

  return (data.suggestions || [])
    .map((item) => ({ label: String(item.placePrediction?.text?.text || "").trim() }))
    .filter((item) => item.label);
}

async function fetchFromNominatim(query: string): Promise<Suggestion[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=5&q=${encodeURIComponent(
    query,
  )}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as Array<{ display_name?: string }>;
  return data
    .map((item) => ({ label: String(item.display_name || "").trim() }))
    .filter((item) => item.label);
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const query = new URL(request.url).searchParams.get("q")?.trim() || "";
    if (query.length < 3) {
      return NextResponse.json({ suggestions: [] });
    }

    const apiKey = getGoogleMapsApiKey();
    const suggestions = apiKey
      ? await fetchFromGoogle(query, apiKey)
      : await fetchFromNominatim(query);

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
