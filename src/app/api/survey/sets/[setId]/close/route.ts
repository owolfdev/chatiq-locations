import { NextResponse } from "next/server";

import {
  bearerFromRequest,
  requireMapperAuth,
} from "@/lib/auth/mapper-auth";
import { closeCaptureSet } from "@/lib/supabase/capture-store";

export const runtime = "nodejs";

type Params = { params: Promise<{ setId: string }> };

export async function POST(_request: Request, { params }: Params) {
  if (!requireMapperAuth(bearerFromRequest(_request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { setId } = await params;
  try {
    const set = await closeCaptureSet(setId);
    return NextResponse.json({ ok: true, set });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Close failed" },
      { status: 400 }
    );
  }
}
