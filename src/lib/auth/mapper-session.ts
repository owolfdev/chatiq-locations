import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * Signed pass issued by ChatIQ after the mapper sends email and password.
 * Keep the payload and HMAC in sync with ChatIQ `mapper-session-token.ts`.
 */
export type MapperSessionClaims = {
  v: 1;
  sub: string;
  team_id: string;
  exp: number;
};

export const MAPPER_SESSION_COOKIE = "locations_mapper_session";
export const MAPPER_SESSION_TTL_SEC = 14 * 24 * 60 * 60;

export function getMapperSessionSecret(): string | null {
  const secret = process.env.MAPPER_SESSION_SECRET?.trim();
  return secret || null;
}

function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function verifyMapperSession(
  token: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000)
): MapperSessionClaims | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig) return null;
  const expected = signBody(body, secret);
  const providedBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as Partial<MapperSessionClaims>;
    if (parsed.v !== 1) return null;
    if (typeof parsed.sub !== "string" || !parsed.sub) return null;
    if (typeof parsed.team_id !== "string" || !parsed.team_id) return null;
    if (typeof parsed.exp !== "number" || parsed.exp <= nowSec) return null;
    return { v: 1, sub: parsed.sub, team_id: parsed.team_id, exp: parsed.exp };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSec,
  };
}

export async function readMapperSession(): Promise<MapperSessionClaims | null> {
  const secret = getMapperSessionSecret();
  if (!secret) return null;
  const jar = await cookies();
  const raw = jar.get(MAPPER_SESSION_COOKIE)?.value;
  if (!raw) return null;
  return verifyMapperSession(raw, secret);
}

export function readSessionFromAuthorization(
  authHeader: string | null
): MapperSessionClaims | null {
  const secret = getMapperSessionSecret();
  if (!secret || !authHeader?.startsWith("Bearer ")) return null;
  return verifyMapperSession(authHeader.slice("Bearer ".length).trim(), secret);
}

/** Only same-app paths. Used after login. */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return "/";
  }
  return raw;
}
