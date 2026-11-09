import { getLocationsServiceToken } from "@/lib/env";

/** Mapper UI / upload APIs. Falls back to service token for pilots. */
export function getLocationsMapperToken(): string | null {
  const mapper = process.env.LOCATIONS_MAPPER_TOKEN?.trim();
  if (mapper) return mapper;
  return getLocationsServiceToken();
}

export function requireMapperAuth(authHeader: string | null): boolean {
  const expected = getLocationsMapperToken();
  if (!expected) {
    // Local-only open when unset; production must configure a token
    if (process.env.NODE_ENV === "production") return false;
    return true;
  }
  if (!authHeader?.startsWith("Bearer ")) return false;
  const provided = authHeader.slice("Bearer ".length).trim();
  return provided.length > 0 && provided === expected;
}

/** Vercel Cron or manual worker tick. */
export function requireCronAuth(
  authHeader: string | null,
  request?: Request
): boolean {
  // Vercel sets this on scheduled invocations
  if (request?.headers.get("x-vercel-cron") === "1") {
    return true;
  }
  const cron = process.env.CRON_SECRET?.trim();
  const service = getLocationsServiceToken();
  const expected = cron || service;
  if (!expected) {
    if (process.env.NODE_ENV === "production") return false;
    return true;
  }
  if (!authHeader?.startsWith("Bearer ")) return false;
  const provided = authHeader.slice("Bearer ".length).trim();
  return provided.length > 0 && provided === expected;
}

export function bearerFromRequest(request: Request): string | null {
  return request.headers.get("authorization");
}
