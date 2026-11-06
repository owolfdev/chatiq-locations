import { MapperClient } from "./mapper-client";
import { getPlace, listZonesForPlace } from "@/lib/supabase/store";

type Props = {
  searchParams: Promise<{ place_id?: string }>;
};

export default async function MapPage({ searchParams }: Props) {
  const params = await searchParams;
  const placeId = params.place_id?.trim() || null;

  if (!placeId) {
    return (
      <main style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.5rem" }}>Store mapper</h1>
        <p style={{ color: "#666" }}>
          Open this page from ChatIQ with a bound place (
          <code>?place_id=…</code>), or add the id to the URL.
        </p>
      </main>
    );
  }

  try {
    const place = await getPlace(placeId);
    const { zones, layout_version_id } = await listZonesForPlace(placeId);

    return (
      <main
        style={{
          padding: "1.25rem",
          maxWidth: 520,
          margin: "0 auto",
          paddingBottom: "3rem",
        }}
      >
        <MapperClient
          placeId={place.id}
          placeName={place.name}
          placeAddress={place.address}
          initialZones={zones}
          layoutVersionId={layout_version_id}
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
