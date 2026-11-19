import { redirect } from "next/navigation";

import {
  getMapperSessionSecret,
  readMapperSession,
} from "@/lib/auth/mapper-session";
import { getPlace, listPlacesForTeam, type PlaceRow } from "@/lib/supabase/store";

export async function loadPlacePage(
  placeId: string | null,
  path: string
): Promise<
  | { ok: true; place: PlaceRow; places: Array<{ id: string; name: string }> }
  | { ok: false; error: string }
> {
  if (!placeId) redirect("/");
  const sessionRequired = Boolean(getMapperSessionSecret());
  const session = await readMapperSession();
  if (sessionRequired && !session) {
    redirect(`/login?next=${encodeURIComponent(`${path}?place_id=${placeId}`)}`);
  }
  try {
    const place = await getPlace(placeId);
    if (session && place.team_id !== session.team_id) {
      return { ok: false, error: "That store is not on your team." };
    }
    const places = session
      ? await listPlacesForTeam({ team_id: session.team_id })
      : [];
    return {
      ok: true,
      place,
      places: places.map((row) => ({ id: row.id, name: row.name })),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to load place",
    };
  }
}
