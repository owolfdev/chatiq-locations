import { NextResponse } from "next/server";

import { denyUnlessMapperScope } from "@/lib/auth/mapper-gate";
import { enqueueExtractJob } from "@/lib/supabase/capture-store";

export const runtime = "nodejs";

type Params = { params: Promise<{ setId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { setId } = await params;
  const denied = await denyUnlessMapperScope(request, { setId });
  if (denied) return denied;
  try {
    const job = await enqueueExtractJob(setId);
    return NextResponse.json({ ok: true, job });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Enqueue failed" },
      { status: 400 }
    );
  }
}
