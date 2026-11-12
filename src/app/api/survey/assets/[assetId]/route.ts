import { NextResponse } from "next/server";

import { denyUnlessMapperScope } from "@/lib/auth/mapper-gate";
import { deleteCaptureAsset } from "@/lib/supabase/capture-store";

export const runtime = "nodejs";

type Params = { params: Promise<{ assetId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const { assetId } = await params;
  const denied = await denyUnlessMapperScope(request, { assetId });
  if (denied) return denied;
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
