import { NextResponse } from "next/server";

import {
  bearerFromRequest,
  requireMapperAuth,
} from "@/lib/auth/mapper-auth";
import { listExtractJobsForPlace } from "@/lib/supabase/capture-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!requireMapperAuth(bearerFromRequest(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const place_id = new URL(request.url).searchParams.get("place_id")?.trim();
  if (!place_id) {
    return NextResponse.json(
      { ok: false, error: "place_id required" },
      { status: 400 }
    );
  }
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
