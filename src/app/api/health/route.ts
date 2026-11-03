import { NextResponse } from "next/server";

import {
  LOCATIONS_API_CONTRACT_VERSION,
  type LocationsHealthResponse,
} from "@/lib/contract";

export const runtime = "nodejs";

export async function GET() {
  const body: LocationsHealthResponse = {
    ok: true,
    service: "chatiq-locations",
    contract_version: LOCATIONS_API_CONTRACT_VERSION,
    persistence: "none",
  };

  return NextResponse.json(body);
}
