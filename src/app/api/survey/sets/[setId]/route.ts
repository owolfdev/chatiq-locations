import { NextResponse } from "next/server";

import {
  bearerFromRequest,
  requireMapperAuth,
} from "@/lib/auth/mapper-auth";
import {
  discardCaptureSet,
  getCaptureSet,
  renameCaptureSet,
} from "@/lib/supabase/capture-store";

export const runtime = "nodejs";

type Params = { params: Promise<{ setId: string }> };

export async function GET(request: Request, { params }: Params) {
  if (!requireMapperAuth(bearerFromRequest(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { setId } = await params;
  try {
    const set = await getCaptureSet(setId);
    return NextResponse.json({ ok: true, set });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Not found" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  if (!requireMapperAuth(bearerFromRequest(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { setId } = await params;
  try {
    const body = (await request.json()) as { name?: string };
    if (!body.name?.trim()) {
      return NextResponse.json(
        { ok: false, error: "name required" },
        { status: 400 }
      );
    }
    const set = await renameCaptureSet({ set_id: setId, name: body.name });
    return NextResponse.json({ ok: true, set });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Rename failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  if (!requireMapperAuth(bearerFromRequest(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { setId } = await params;
  try {
    await discardCaptureSet(setId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Delete failed" },
      { status: 400 }
    );
  }
}
