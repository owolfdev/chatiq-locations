import { NextResponse } from "next/server";

import { denyUnlessMapperScope } from "@/lib/auth/mapper-gate";
import {
  createCaptureSet,
  listCaptureSets,
} from "@/lib/supabase/capture-store";
import { LocationsStoreError } from "@/lib/supabase/store";

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
    const sets = await listCaptureSets(place_id);
    return NextResponse.json({ ok: true, sets });
  } catch (e) {
    const message = e instanceof Error ? e.message : "List failed";
    const status = e instanceof LocationsStoreError ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      place_id?: string;
      /** Free-form album name (preferred). */
      name?: string;
      zone_type?: string;
      zone_label?: string;
      pose_summary?: string | null;
    };
    const label = (body.name || body.zone_label || "").trim();
    if (!body.place_id?.trim() || !label) {
      return NextResponse.json(
        { ok: false, error: "place_id and name required" },
        { status: 400 }
      );
    }
    const denied = await denyUnlessMapperScope(request, {
      placeId: body.place_id.trim(),
    });
    if (denied) return denied;
    const set = await createCaptureSet({
      place_id: body.place_id.trim(),
      zone_type: body.zone_type || "album",
      zone_label: label,
      pose_summary: body.pose_summary,
    });
    return NextResponse.json({ ok: true, set });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
