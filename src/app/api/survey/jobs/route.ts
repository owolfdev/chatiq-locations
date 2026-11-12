import { NextResponse } from "next/server";

import { denyUnlessMapperScope } from "@/lib/auth/mapper-gate";
import { listExtractJobsForPlace } from "@/lib/supabase/capture-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const place_id = new URL(request.url).searchParams.get("place_id")?.trim();
  if (!place_id) {
    return NextResponse.json(
      { ok: false, error: "place_id required" },
      { status: 400 }
    );
  }
  const denied = await denyUnlessMapperScope(request, { placeId: place_id });
  if (denied) return denied;
  try {
    const jobs = await listExtractJobsForPlace(place_id);
    return NextResponse.json({ ok: true, jobs });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "List failed" },
      { status: 400 }
    );
  }
}
