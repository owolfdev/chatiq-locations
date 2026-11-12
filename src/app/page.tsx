import { redirect } from "next/navigation";

import { readMapperSession, getMapperSessionSecret } from "@/lib/auth/mapper-session";
import { listPlacesForTeam } from "@/lib/supabase/store";

export default async function HomePage() {
  if (!getMapperSessionSecret()) {
    return (
      <main style={{ padding: "2rem", maxWidth: 640 }}>
        <h1 style={{ fontSize: "1.75rem" }}>Store mapper</h1>
        <p style={{ color: "#666", lineHeight: 1.5 }}>
          Sign-in is not configured yet. Set <code>MAPPER_SESSION_SECRET</code>{" "}
          and <code>CHATIQ_BASE_URL</code>, then open this page again.
        </p>
      </main>
    );
  }

  const session = await readMapperSession();
  if (!session) redirect("/login");

  let places: Awaited<ReturnType<typeof listPlacesForTeam>> = [];
  let loadError: string | null = null;
  try {
    places = await listPlacesForTeam({ team_id: session.team_id });
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load stores";
  }

  return (
    <main style={{ padding: "1.5rem", maxWidth: 480, margin: "0 auto" }}>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#888",
        }}
      >
        Store mapper
      </p>
      <h1 style={{ margin: "4px 0 8px", fontSize: "1.75rem" }}>Your stores</h1>
      <p style={{ margin: "0 0 16px", color: "#555", lineHeight: 1.45 }}>
        Pick the store you are visiting. This does not change which store a bot
        answers for.
      </p>
      {loadError ? <p style={{ color: "#b71c1c" }}>{loadError}</p> : null}
      {places.length === 0 && !loadError ? (
        <p style={{ color: "#555" }}>No stores yet for this team.</p>
      ) : (
        <form action="/map" method="get" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
            Store
            <select
              name="place_id"
              defaultValue={places[0]?.id}
              required
              style={{
                font: "inherit",
                fontSize: 16,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: "#fff",
              }}
            >
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            style={{
              font: "inherit",
              fontSize: 16,
              padding: "12px 14px",
              borderRadius: 8,
              border: "none",
              background: "#111",
              color: "#fff",
            }}
          >
            Open store
          </button>
        </form>
      )}
      <p style={{ marginTop: 24 }}>
        <a href="/api/auth/logout">Sign out</a>
      </p>
    </main>
  );
}
