import { loadPlacePage } from "@/lib/auth/load-place-page";
import { getPlaceLogo, listPromotionsForPlace } from "@/lib/supabase/store";

import { PromotionsClient } from "./promotions-client";

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

export default async function PromotionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const placeId = params.place_id?.trim() || null;
  const loaded = await loadPlacePage(placeId, "/promotions");
  if (!loaded.ok) {
    return (
      <main style={frame}>
        <h1 style={{ fontSize: "1.5rem" }}>Promotions</h1>
        <p style={{ color: "#b71c1c" }}>{loaded.error}</p>
        <p>
          <a href="/">Back to your stores</a>
        </p>
      </main>
    );
  }

  let promotions: Awaited<ReturnType<typeof listPromotionsForPlace>> = [];
  let logoUrl: string | null = null;
  let loadError: string | null = null;
  try {
    promotions = await listPromotionsForPlace(loaded.place.id);
    logoUrl = (await getPlaceLogo(loaded.place.id)).image_url;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load promotions";
  }

  if (loadError) {
    return (
      <main style={frame}>
        <h1 style={{ fontSize: "1.5rem" }}>Promotions</h1>
        <p style={{ color: "#b71c1c" }}>{loadError}</p>
      </main>
    );
  }

  return (
    <main style={frame}>
      <PromotionsClient
        placeId={loaded.place.id}
        placeName={loaded.place.name}
        initialLogoUrl={logoUrl}
        initialPromotions={promotions}
      />
    </main>
  );
}
