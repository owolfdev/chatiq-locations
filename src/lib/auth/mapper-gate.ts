import { NextResponse } from "next/server";

import { requireMapperAuth } from "@/lib/auth/mapper-auth";
import {
  readMapperSession,
  readSessionFromAuthorization,
} from "@/lib/auth/mapper-session";
import { createLocationsAdminClient } from "@/lib/supabase/admin";
import { getCaptureSet, getExtractJob } from "@/lib/supabase/capture-store";
import { getPlace } from "@/lib/supabase/store";
import { LOCATIONS_TABLES } from "@/lib/supabase/tables";

export type MapperAuthResult =
  | { ok: true; teamId: string | null }
  | { ok: false };

/**
 * Shared mapper token → teamId null (existing Open mapper link).
 * Signed session → that team only.
 */
export async function authorizeMapper(request: Request): Promise<MapperAuthResult> {
  const session = await readMapperSession();
  if (session) return { ok: true, teamId: session.team_id };
  const fromBearer = readSessionFromAuthorization(
    request.headers.get("authorization")
  );
  if (fromBearer) return { ok: true, teamId: fromBearer.team_id };
  if (requireMapperAuth(request.headers.get("authorization"))) {
    return { ok: true, teamId: null };
  }
  return { ok: false };
}

async function teamForAsset(assetId: string): Promise<string | null> {
  const supabase = createLocationsAdminClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from(LOCATIONS_TABLES.captureAssets)
    .select("set_id")
    .eq("id", assetId)
    .maybeSingle();
  const setId =
    data && typeof data.set_id === "string" ? data.set_id : null;
  if (!setId) return null;
  try {
    const set = await getCaptureSet(setId);
    return set.team_id;
  } catch {
    return null;
  }
}

async function teamForScope(scope: {
  placeId?: string | null;
  setId?: string | null;
  assetId?: string | null;
  jobId?: string | null;
}): Promise<string | null> {
  try {
    if (scope.placeId) {
      const place = await getPlace(scope.placeId);
      return place.team_id;
    }
    if (scope.setId) {
      const set = await getCaptureSet(scope.setId);
      return set.team_id;
    }
    if (scope.assetId) return teamForAsset(scope.assetId);
    if (scope.jobId) {
      const job = await getExtractJob(scope.jobId);
      const place = await getPlace(job.place_id);
      return place.team_id;
    }
  } catch {
    return null;
  }
  return null;
}

/** Null means the request may continue. */
export async function denyUnlessMapperScope(
  request: Request,
  scope: {
    placeId?: string | null;
    setId?: string | null;
    assetId?: string | null;
    jobId?: string | null;
  }
): Promise<NextResponse | null> {
  const auth = await authorizeMapper(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.teamId) return null;
  const teamId = await teamForScope(scope);
  if (!teamId) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (teamId !== auth.teamId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  return null;
}
