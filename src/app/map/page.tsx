import { redirect } from "next/navigation";

import {
  getMapperSessionSecret,
  readMapperSession,
} from "@/lib/auth/mapper-session";
import { getPlace, listPlacesForTeam, listZonesForPlace } from "@/lib/supabase/store";
import { MapperClient } from "./mapper-client";

type Props = {
  searchParams: Promise<{ place_id?: string }>;
};

export default async function MapPage({ searchParams }: Props) {
  const params = await searchParams;
  const placeId = params.place_id?.trim() || null;
  const sessionRequired = Boolean(getMapperSessionSecret());
  const session = await readMapperSession();

  if (!placeId) {
    if (sessionRequired) redirect("/");
    return (
      <main style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.5rem" }}>Store mapper</h1>
        <p style={{ color: "#666" }}>
          Open a store from the home list, or add <code>?place_id=…</code> to
          the URL.
        </p>
      </main>
    );
  }

  if (sessionRequired && !session) {
    redirect(`/login?next=${encodeURIComponent(`/map?place_id=${placeId}`)}`);
  }

  try {
    const place = await getPlace(placeId);
    if (session && place.team_id !== session.team_id) {
      return (
        <main style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
          <h1 style={{ fontSize: "1.5rem" }}>Store mapper</h1>
          <p style={{ color: "#b71c1c" }}>That store is not on your team.</p>
          <p>
            <a href="/">Back to your stores</a>
          </p>
        </main>
      );
    }
    const { zones, layout_version_id } = await listZonesForPlace(placeId);
    const places = session
      ? await listPlacesForTeam({ team_id: session.team_id })
      : [];

    return (
      <main
        style={{
          padding: "1.25rem",
          maxWidth: 520,
          margin: "0 auto",
          /* Extra top room so the place title clears mobile URL/toolbar chrome */
          paddingTop: "calc(1.25rem + 12px)",
          paddingBottom: "3rem",
        }}
      >
        <MapperClient
          placeId={place.id}
          placeName={place.name}
          placeAddress={place.address}
          initialZones={zones}
          layoutVersionId={layout_version_id}
          places={places.map((row) => ({ id: row.id, name: row.name }))}
          sessionUploads={Boolean(session)}
        />
      </main>
    );
  } catch (e) {
    return (
      <main style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.5rem" }}>Store mapper</h1>
        <p style={{ color: "#b71c1c" }}>
          {e instanceof Error ? e.message : "Failed to load place"}
        </p>
      </main>
    );
  }
}
