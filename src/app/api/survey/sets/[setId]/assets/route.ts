import { NextResponse } from "next/server";

import {
  bearerFromRequest,
  requireMapperAuth,
} from "@/lib/auth/mapper-auth";
import {
  beginCaptureAssetUpload,
  listCaptureAssets,
} from "@/lib/supabase/capture-store";

export const runtime = "nodejs";

type Params = { params: Promise<{ setId: string }> };

export async function GET(request: Request, { params }: Params) {
  if (!requireMapperAuth(bearerFromRequest(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { setId } = await params;
  try {
    const assets = await listCaptureAssets(setId);
    return NextResponse.json({ ok: true, assets });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "List failed" },
      { status: 400 }
    );
  }
}

/** Begin signed upload for one compressed photo. */
export async function POST(request: Request, { params }: Params) {
  if (!requireMapperAuth(bearerFromRequest(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { setId } = await params;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      content_type?: string;
      byte_size?: number;
    };
    const result = await beginCaptureAssetUpload({
      set_id: setId,
      content_type: body.content_type,
      byte_size: body.byte_size,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Upload begin failed" },
      { status: 400 }
    );
  }
}
