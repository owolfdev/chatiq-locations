import { NextResponse } from "next/server";

import {
  bearerFromRequest,
  requireCronAuth,
  requireMapperAuth,
} from "@/lib/auth/mapper-auth";
import {
  cleanupExpiredCaptureAssets,
  tickExtractQueue,
} from "@/lib/supabase/capture-store";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel Cron (or manual): process one pending capture asset per call.
 * Also runs a small TTL cleanup pass.
 * Auth: cron secret / x-vercel-cron, or mapper token (manual "Run tick").
 */
export async function GET(request: Request) {
  const auth = bearerFromRequest(request);
  if (!requireCronAuth(auth, request) && !requireMapperAuth(auth)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const tick = await tickExtractQueue();
    const cleanup = await cleanupExpiredCaptureAssets();
    return NextResponse.json({ ok: true, tick, cleanup });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Tick failed",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
