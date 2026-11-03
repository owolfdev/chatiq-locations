export default function HomePage() {
  return (
    <main style={{ padding: "2rem", maxWidth: 640 }}>
      <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>
        ChatIQ Locations
      </h1>
      <p style={{ color: "#666", lineHeight: 1.5 }}>
        Sibling mapping service for places, zones, and published item-location
        knowledge. Phase 0 skeleton — persistence and commands come next.
      </p>
      <ul style={{ marginTop: "1.5rem", lineHeight: 1.8 }}>
        <li>
          <a href="/api/health">GET /api/health</a>
        </li>
        <li>
          POST /api/v1/commands/execute — Bearer{" "}
          <code>LOCATIONS_SERVICE_TOKEN</code> (Phase 1)
        </li>
      </ul>
      <p style={{ marginTop: "1.5rem", color: "#666", fontSize: "0.9rem" }}>
        Local: <code>npm run dev</code> → port 3004. See{" "}
        <code>ROADMAP.md</code>.
      </p>
    </main>
  );
}
