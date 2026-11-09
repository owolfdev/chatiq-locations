const STORAGE_KEY = "chatiq_locations_mapper_token";

export function readMapperToken(): string {
  if (typeof window === "undefined") return "";
  const fromUrl = new URLSearchParams(window.location.search).get(
    "access_token"
  );
  if (fromUrl?.trim()) {
    try {
      sessionStorage.setItem(STORAGE_KEY, fromUrl.trim());
    } catch {
      /* ignore */
    }
    return fromUrl.trim();
  }
  try {
    return sessionStorage.getItem(STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function mapperAuthHeaders(): HeadersInit {
  const token = readMapperToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function hasMapperToken(): boolean {
  return Boolean(readMapperToken());
}
