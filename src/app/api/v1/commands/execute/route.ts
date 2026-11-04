import { NextResponse } from "next/server";

import {
  executeLocationsCommand,
  statusForCommandResult,
  type LocationsCommandExecuteRequest,
} from "@/lib/command-execute";
import { LOCATIONS_API_CONTRACT_VERSION } from "@/lib/contract";
import { requireServiceAuth } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!requireServiceAuth(request.headers.get("authorization"))) {
    return NextResponse.json(
      {
        contract_version: LOCATIONS_API_CONTRACT_VERSION,
        ok: false,
        error: "Unauthorized",
        code: "UNAUTHORIZED",
      },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        contract_version: LOCATIONS_API_CONTRACT_VERSION,
        ok: false,
        error: "Invalid JSON body",
        code: "INVALID_JSON",
      },
      { status: 400 }
    );
  }

  const req = body as LocationsCommandExecuteRequest;
  if (
    req.contract_version &&
    req.contract_version !== LOCATIONS_API_CONTRACT_VERSION
  ) {
    return NextResponse.json(
      {
        contract_version: LOCATIONS_API_CONTRACT_VERSION,
        ok: false,
        error: `Unsupported contract_version: ${req.contract_version}`,
        code: "UNSUPPORTED_CONTRACT",
      },
      { status: 400 }
    );
  }

  if (!req.command || typeof req.command !== "string") {
    return NextResponse.json(
      {
        contract_version: LOCATIONS_API_CONTRACT_VERSION,
        ok: false,
        error: "command required",
        code: "INVALID_COMMAND",
      },
      { status: 400 }
    );
  }

  const result = await executeLocationsCommand(req);
  return NextResponse.json(result, { status: statusForCommandResult(result) });
}
