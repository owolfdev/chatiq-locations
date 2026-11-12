import { after, NextResponse } from "next/server";

import { authorizeMapper } from "@/lib/auth/mapper-gate";
import {
  bearerFromRequest,
  getLocationsMapperToken,
  requireCronAuth,
  requireMapperAuth,
} from "@/lib/auth/mapper-auth";
import { getLocationsServiceToken } from "@/lib/env";
import {
  cleanupExpiredCaptureAssets,
  runExtractBudget,
} from "@/lib/supabase/capture-store";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUDGET_MS = 45_000;

/**
 * One Vercel run extracts several photos, then starts the next run if the
 * queue is still going. The phone does not have to stay open.
 * Auth: Vercel Cron, cron/service token, mapper token, or a signed-in mapper.
 */
function chainBearer(): string | null {
  return (
    process.env.CRON_SECRET?.trim() ||
    getLocationsServiceToken() ||
    getLocationsMapperToken()
  );
}

async function kickNextRun(request: Request) {
  const token = chainBearer();
  if (!token && process.env.NODE_ENV === "production") return;
  const url = new URL("/api/cron/extract-tick", request.url);
  await fetch(url, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function workThenChain(request: Request) {
  const tick = await runExtractBudget(BUDGET_MS);
  if (!tick.processed) {
    await cleanupExpiredCaptureAssets();
  }
  if (tick.more) {
    await kickNextRun(request);
  }
  return tick;
}

export async function GET(request: Request) {
  const auth = bearerFromRequest(request);
  if (!requireCronAuth(auth, request) && !requireMapperAuth(auth)) {
    const session = await authorizeMapper(request);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }
  after(() =>
    workThenChain(request).catch((error) => {
      console.error("[extract-tick]", error);
    })
  );
  return NextResponse.json({ ok: true, accepted: true });
}

export async function POST(request: Request) {
  return GET(request);
}
