"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { MapperStatus } from "@/components/mapper-status";

export function OpenStoreForm(props: {
  places: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [placeId, setPlaceId] = useState(props.places[0]?.id ?? "");
  const [openingName, setOpeningName] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const place = props.places.find((row) => row.id === placeId);
    if (!place) return;
    setOpeningName(place.name);
    router.push(`/map?place_id=${encodeURIComponent(place.id)}`);
  }

  if (openingName) {
    return <MapperStatus title={openingName} detail="Opening store…" />;
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={label}>
        Store
        <select
          name="place_id"
          value={placeId}
          required
          onChange={(e) => setPlaceId(e.target.value)}
          style={input}
        >
          {props.places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" style={button}>
        Open store
      </button>
    </form>
  );
}

const label: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 14,
};

const input: CSSProperties = {
  font: "inherit",
  fontSize: 16,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#fff",
};

const button: CSSProperties = {
  font: "inherit",
  fontSize: 16,
  padding: "12px 14px",
  borderRadius: 8,
  border: "none",
  background: "#111",
  color: "#fff",
};
