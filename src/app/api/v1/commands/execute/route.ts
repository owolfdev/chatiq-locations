import { NextResponse } from "next/server";

import { LOCATIONS_API_CONTRACT_VERSION } from "@/lib/contract";
import { requireServiceAuth } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Phase 0 stub: auth + contract echo. Real place/zone/map commands land in Phase 1.
 */
export async function POST(request: Request) {
  if (!requireServiceAuth(request.headers.get("authorization"))) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  let body: { command?: unknown; slots?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const command =
    typeof body.command === "string" ? body.command.trim() : "";
  if (!command) {
    return NextResponse.json(
      { ok: false, error: "command required", code: "INVALID_COMMAND" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Command not implemented yet",
      code: "NOT_IMPLEMENTED",
      contract_version: LOCATIONS_API_CONTRACT_VERSION,
      command,
    },
    { status: 501 }
  );
}
