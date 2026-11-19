import Link from "next/link";

const ITEMS = [
  { id: "map", label: "Map" },
  { id: "store", label: "Store" },
  { id: "promotions", label: "Promotions" },
] as const;

export function PlaceNav({
  placeId,
  current,
}: {
  placeId: string;
  current: (typeof ITEMS)[number]["id"];
}) {
  return (
    <nav style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 15 }}>
      {ITEMS.map((item) => {
        const active = item.id === current;
        return (
          <Link
            key={item.id}
            href={`/${item.id}?place_id=${encodeURIComponent(placeId)}`}
            style={{
              color: active ? "#111" : "#0b5fff",
              fontWeight: active ? 700 : 500,
              textDecoration: active ? "none" : "underline",
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
