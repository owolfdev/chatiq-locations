import { NextResponse } from "next/server";

import { getLocationsServiceToken } from "@/lib/env";
import {
  MAPPER_SESSION_COOKIE,
  getMapperSessionSecret,
  sessionCookieOptions,
  verifyMapperSession,
} from "@/lib/auth/mapper-session";

export const runtime = "nodejs";

function chatiqBaseUrl(): string {
  const raw = process.env.CHATIQ_BASE_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export async function POST(request: Request) {
  const secret = getMapperSessionSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Mapper sign-in is not configured" },
      { status: 503 }
    );
  }
  const service = getLocationsServiceToken();
  if (!service) {
    return NextResponse.json(
      { ok: false, error: "Locations service token is not configured" },
      { status: 503 }
    );
  }

  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    email = typeof body.email === "string" ? body.email.trim() : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Email and password are required" },
      { status: 400 }
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${chatiqBaseUrl()}/api/locations/mapper-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${service}`,
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not reach ChatIQ to sign in" },
      { status: 502 }
    );
  }

  const json = (await upstream.json().catch(() => null)) as {
    ok?: boolean;
    token?: string;
    error?: string;
    expires_at?: string;
  } | null;
  if (!upstream.ok || !json?.ok || !json.token) {
    return NextResponse.json(
      { ok: false, error: json?.error || "Sign-in failed" },
      { status: upstream.status || 401 }
    );
  }

  const claims = verifyMapperSession(json.token, secret);
  if (!claims) {
    return NextResponse.json(
      {
        ok: false,
        error: "Sign-in pass could not be verified. MAPPER_SESSION_SECRET must match on both apps.",
      },
      { status: 502 }
    );
  }

  const maxAge = Math.max(60, claims.exp - Math.floor(Date.now() / 1000));
  const response = NextResponse.json({
    ok: true,
    expires_at: json.expires_at || new Date(claims.exp * 1000).toISOString(),
  });
  response.cookies.set(MAPPER_SESSION_COOKIE, json.token, sessionCookieOptions(maxAge));
  return response;
}
