import { NextResponse } from "next/server";

import {
  LOCATIONS_API_CONTRACT_VERSION,
  type LocationsHealthResponse,
} from "@/lib/contract";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { probeSupabasePersistence } from "@/lib/supabase/probe";

export const runtime = "nodejs";

export async function GET() {
  const configured = isSupabaseConfigured();
  let persistence: LocationsHealthResponse["persistence"] = "none";
  let supabase: { configured: boolean; reachable: boolean; error?: string } = {
    configured,
    reachable: false,
  };

  if (configured) {
    const probe = await probeSupabasePersistence();
    if (probe.ok) {
      persistence = "supabase";
      supabase = { configured: true, reachable: true };
    } else {
      supabase = {
        configured: true,
        reachable: false,
        error: probe.error,
      };
    }
  }

  const body: LocationsHealthResponse & {
    supabase?: typeof supabase;
  } = {
    ok: true,
    service: "chatiq-locations",
    contract_version: LOCATIONS_API_CONTRACT_VERSION,
    persistence,
    supabase,
  };

  return NextResponse.json(body);
}
