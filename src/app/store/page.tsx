import { loadPlacePage } from "@/lib/auth/load-place-page";

import { StoreClient } from "./store-client";

type Props = {
  searchParams: Promise<{ place_id?: string }>;
};

const frame = {
  padding: "1.25rem",
  maxWidth: 520,
  margin: "0 auto",
  paddingTop: "calc(1.25rem + 12px)",
  paddingBottom: "3rem",
} as const;

export default async function StorePage({ searchParams }: Props) {
  const params = await searchParams;
  const placeId = params.place_id?.trim() || null;
  const loaded = await loadPlacePage(placeId, "/store");
  if (!loaded.ok) {
    return (
      <main style={frame}>
        <h1 style={{ fontSize: "1.5rem" }}>Store</h1>
        <p style={{ color: "#b71c1c" }}>{loaded.error}</p>
        <p>
          <a href="/">Back to your stores</a>
        </p>
      </main>
    );
  }

  return (
    <main style={frame}>
      <StoreClient
        placeId={loaded.place.id}
        placeName={loaded.place.name}
        placeAddress={loaded.place.address}
        placePhone={loaded.place.phone}
        placeWebsite={loaded.place.website}
        placeContact={loaded.place.contact}
        placeNotes={loaded.place.notes}
      />
    </main>
  );
}
