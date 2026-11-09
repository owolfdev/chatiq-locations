import { NextResponse } from "next/server";

import {
  bearerFromRequest,
  requireMapperAuth,
} from "@/lib/auth/mapper-auth";
import {
  createCaptureSet,
  listCaptureSets,
} from "@/lib/supabase/capture-store";
import { LocationsStoreError } from "@/lib/supabase/store";

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
    const sets = await listCaptureSets(place_id);
    return NextResponse.json({ ok: true, sets });
  } catch (e) {
    const message = e instanceof Error ? e.message : "List failed";
    const status = e instanceof LocationsStoreError ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(request: Request) {
  if (!requireMapperAuth(bearerFromRequest(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      place_id?: string;
      zone_type?: string;
      zone_label?: string;
      pose_summary?: string | null;
    };
    if (!body.place_id?.trim() || !body.zone_label?.trim()) {
      return NextResponse.json(
        { ok: false, error: "place_id and zone_label required" },
        { status: 400 }
      );
    }
    const set = await createCaptureSet({
      place_id: body.place_id.trim(),
      zone_type: body.zone_type || "aisle",
      zone_label: body.zone_label.trim(),
      pose_summary: body.pose_summary,
    });
    return NextResponse.json({ ok: true, set });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
