import { getMapperSessionSecret, readMapperSession } from "@/lib/auth/mapper-session";
import { getPlace, getZone } from "@/lib/supabase/store";

/** When the session secret is unset, mapper actions stay open for the existing handoff. */
export async function guardPlace(place_id: string): Promise<string | null> {
  const secret = getMapperSessionSecret();
  if (!secret) return null;
  const session = await readMapperSession();
  if (!session) return "Sign in required";
  try {
    const place = await getPlace(place_id);
    if (place.team_id !== session.team_id) {
      return "That store is not on your team";
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Failed to load store";
  }
}

export async function guardZone(zone_id: string): Promise<string | null> {
  const secret = getMapperSessionSecret();
  if (!secret) return null;
  const session = await readMapperSession();
  if (!session) return "Sign in required";
  try {
    const zone = await getZone(zone_id);
    if (!zone) return "Zone not found";
    if (zone.team_id !== session.team_id) {
      return "That store is not on your team";
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Failed to load zone";
  }
}
