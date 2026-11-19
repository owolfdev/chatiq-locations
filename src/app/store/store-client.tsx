"use client";

import { useState, useTransition, type CSSProperties } from "react";

import { saveMapperPlace } from "@/app/map/actions";
import { PlaceNav } from "@/components/place-nav";

type Props = {
  placeId: string;
  placeName: string;
  placeAddress: string | null;
  placePhone: string | null;
  placeWebsite: string | null;
  placeContact: string | null;
  placeNotes: string | null;
};

export function StoreClient(props: Props) {
  const [name, setName] = useState(props.placeName);
  const [address, setAddress] = useState(props.placeAddress || "");
  const [phone, setPhone] = useState(props.placePhone || "");
  const [website, setWebsite] = useState(props.placeWebsite || "");
  const [contact, setContact] = useState(props.placeContact || "");
  const [notes, setNotes] = useState(props.placeNotes || "");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave() {
    if (!name.trim()) {
      setError("Enter a store name");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await saveMapperPlace({
        place_id: props.placeId,
        name,
        address,
        phone,
        website,
        contact,
        notes,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName(res.place.name);
      setAddress(res.place.address || "");
      setPhone(res.place.phone || "");
      setWebsite(res.place.website || "");
      setContact(res.place.contact || "");
      setNotes(res.place.notes || "");
      setStatus("Store saved");
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <p style={eyebrow}>Store</p>
        <h1 style={{ margin: "0 0 4px", fontSize: "1.75rem" }}>{name || "Store"}</h1>
        <PlaceNav placeId={props.placeId} current="store" />
        <p style={{ margin: "10px 0 0", fontSize: 14 }}>
          <a href="/">All stores</a>
          {" · "}
          <a href="/api/auth/logout">Sign out</a>
        </p>
      </header>

      <section style={card}>
        <p style={{ ...hint, marginTop: 0 }}>
          Details for this branch. Aisle notes stay on the map.
        </p>
        <label style={label}>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Store name"
            style={{ ...input, width: "100%", marginTop: 6 }}
          />
        </label>
        <label style={{ ...label, marginTop: 10 }}>
          Address
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="3522 Lat Phrao Rd, Bang Kapi, Bangkok"
            aria-label="Store address"
            rows={2}
            style={{ ...input, width: "100%", marginTop: 6, resize: "vertical" }}
          />
        </label>
        <label style={{ ...label, marginTop: 10 }}>
          Phone
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="02 000 0000"
            aria-label="Store phone"
            inputMode="tel"
            style={{ ...input, width: "100%", marginTop: 6 }}
          />
        </label>
        <label style={{ ...label, marginTop: 10 }}>
          Website
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.com"
            aria-label="Store website"
            inputMode="url"
            style={{ ...input, width: "100%", marginTop: 6 }}
          />
        </label>
        <label style={{ ...label, marginTop: 10 }}>
          Contact
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Store desk or an email"
            aria-label="Store contact"
            style={{ ...input, width: "100%", marginTop: 6 }}
          />
        </label>
        <label style={{ ...label, marginTop: 10 }}>
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Open until 10pm. Parking is behind the store."
            aria-label="Store notes"
            rows={2}
            style={{ ...input, width: "100%", marginTop: 6, resize: "vertical" }}
          />
        </label>
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !name.trim()}
          style={{ ...primaryBtn, marginTop: 10 }}
        >
          {pending ? "Saving…" : "Save store"}
        </button>
      </section>

      {error ? <p style={{ color: "#b71c1c", margin: 0 }}>{error}</p> : null}
      {status ? <p style={{ color: "#1b5e20", margin: 0 }}>{status}</p> : null}
    </div>
  );
}

const eyebrow: CSSProperties = {
  margin: 0,
  fontSize: 13,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#888",
};

const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 14,
};

const label: CSSProperties = {
  display: "block",
  fontSize: 15,
  fontWeight: 600,
  marginBottom: 6,
};

const hint: CSSProperties = {
  margin: "6px 0 12px",
  fontSize: 14,
  color: "#777",
};

const input: CSSProperties = {
  fontSize: 17,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#fff",
};

const primaryBtn: CSSProperties = {
  fontSize: 16,
  padding: "10px 14px",
  borderRadius: 8,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 600,
};
