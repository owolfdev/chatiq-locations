export function getLocationsServiceToken(): string | null {
  const token = process.env.LOCATIONS_SERVICE_TOKEN?.trim();
  return token || null;
}

/** Fail closed in production when token unset; open locally when unset. */
export function requireServiceAuth(authHeader: string | null): boolean {
  const expected = getLocationsServiceToken();
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return false;
    }
    return true;
  }
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }
  const provided = authHeader.slice("Bearer ".length).trim();
  return provided.length > 0 && provided === expected;
}
