import { NextResponse } from "next/server";

import {
  MAPPER_SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/mapper-session";

export const runtime = "nodejs";

function cleared(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(MAPPER_SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}

export async function GET(request: Request) {
  return cleared(request);
}

export async function POST(request: Request) {
  return cleared(request);
}
