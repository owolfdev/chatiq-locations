import { NextResponse } from "next/server";

import {
  bearerFromRequest,
  requireMapperAuth,
} from "@/lib/auth/mapper-auth";
import { deleteCaptureAsset } from "@/lib/supabase/capture-store";

export const runtime = "nodejs";

type Params = { params: Promise<{ assetId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  if (!requireMapperAuth(bearerFromRequest(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { assetId } = await params;
  try {
    await deleteCaptureAsset(assetId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Delete failed" },
      { status: 400 }
    );
  }
}
