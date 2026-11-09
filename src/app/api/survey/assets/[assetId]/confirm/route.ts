import { NextResponse } from "next/server";

import {
  bearerFromRequest,
  requireMapperAuth,
} from "@/lib/auth/mapper-auth";
import { confirmCaptureAssetUpload } from "@/lib/supabase/capture-store";

export const runtime = "nodejs";

type Params = { params: Promise<{ assetId: string }> };

export async function POST(request: Request, { params }: Params) {
  if (!requireMapperAuth(bearerFromRequest(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { assetId } = await params;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      byte_size?: number;
    };
    const asset = await confirmCaptureAssetUpload({
      asset_id: assetId,
      byte_size: body.byte_size,
    });
    return NextResponse.json({ ok: true, asset });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Confirm failed" },
      { status: 400 }
    );
  }
}
