"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";

import { PlaceNav } from "@/components/place-nav";
import type { PromotionRow } from "@/lib/supabase/store";

import {
  clearPlaceLogoImage,
  generatePlacePromotionImage,
  removePlacePromotion,
  savePlaceLogoImage,
  savePlacePromotion,
  uploadPlacePromotionImage,
} from "./actions";

type Props = {
  placeId: string;
  placeName: string;
  initialLogoUrl: string | null;
  initialPromotions: PromotionRow[];
};

type Draft = {
  id: string | null;
  keywords: string;
  body: string;
  imagePath: string;
  imageUrl: string;
  imagePrompt: string;
  startsLocal: string;
  durationDays: string;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalInput(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function blankDraft(): Draft {
  return {
    id: null,
    keywords: "",
    body: "",
    imagePath: "",
    imageUrl: "",
    imagePrompt: "",
    startsLocal: toLocalInput(new Date()),
    durationDays: "7",
  };
}

function draftFromPromotion(row: PromotionRow): Draft {
  const start = new Date(row.starts_at);
  const end = new Date(row.ends_at);
  const days = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000)
  );
  return {
    id: row.id,
    keywords: row.keywords,
    body: row.body || "",
    imagePath: row.image_path || "",
    imageUrl: row.image_url || "",
    imagePrompt: row.image_prompt || "",
    startsLocal: toLocalInput(start),
    durationDays: String(days),
  };
}

function endFromDraft(draft: Draft): Date | null {
  const start = new Date(draft.startsLocal);
  const days = Number(draft.durationDays);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(days) || days <= 0) {
    return null;
  }
  return new Date(start.getTime() + days * 86_400_000);
}

function windowLabel(row: PromotionRow, now: number): string {
  const start = new Date(row.starts_at).getTime();
  const end = new Date(row.ends_at).getTime();
  if (now < start) return "Upcoming";
  if (now >= end) return "Ended";
  return "Running";
}

export function PromotionsClient(props: Props) {
  const [promotions, setPromotions] = useState(props.initialPromotions);
  const [logoUrl, setLogoUrl] = useState(props.initialLogoUrl);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const end = useMemo(() => endFromDraft(draft), [draft]);

  function patch(partial: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function onSave() {
    if (!end) {
      setError("Enter a start and a duration of at least 1 day");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await savePlacePromotion({
        place_id: props.placeId,
        id: draft.id,
        keywords: draft.keywords,
        body: draft.body,
        image_path: draft.imagePath,
        image_url: draft.imageUrl,
        image_prompt: draft.imagePrompt,
        starts_at: new Date(draft.startsLocal).toISOString(),
        ends_at: end.toISOString(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPromotions(res.promotions);
      setDraft(draftFromPromotion(res.promotion));
      setStatus("Promotion saved");
    });
  }

  function onGenerate() {
    if (!draft.imagePrompt.trim()) {
      setError("Enter an image prompt");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await generatePlacePromotionImage({
        place_id: props.placeId,
        prompt: draft.imagePrompt,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      patch({ imagePath: res.image_path, imageUrl: res.image_url });
      setStatus("Image ready. Save the promotion to keep it on the offer.");
    });
  }

  function onUpload(file: File | null) {
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      startTransition(async () => {
        const res = await uploadPlacePromotionImage({
          place_id: props.placeId,
          data_url: dataUrl,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        patch({ imagePath: res.image_path, imageUrl: res.image_url });
        setStatus("Image ready. Save the promotion to keep it on the offer.");
      });
    };
    reader.readAsDataURL(file);
  }

  function onLogo(file: File | null) {
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      startTransition(async () => {
        const res = await savePlaceLogoImage({
          place_id: props.placeId,
          data_url: dataUrl,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setLogoUrl(res.logo.image_url);
        setStatus("Store logo saved");
      });
    };
    reader.readAsDataURL(file);
  }

  function onClearLogo() {
    setError(null);
    startTransition(async () => {
      const res = await clearPlaceLogoImage({ place_id: props.placeId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLogoUrl(null);
      setStatus("Store logo removed");
    });
  }

  function onDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await removePlacePromotion({ place_id: props.placeId, id });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPromotions(res.promotions);
      if (draft.id === id) setDraft(blankDraft());
      setStatus("Promotion removed");
    });
  }

  const now = Date.now();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <p style={eyebrow}>Promotions</p>
        <h1 style={{ margin: "0 0 4px", fontSize: "1.75rem" }}>{props.placeName}</h1>
        <PlaceNav placeId={props.placeId} current="promotions" />
        <p style={{ margin: "10px 0 0", fontSize: 14 }}>
          <a href="/">All stores</a>
          {" · "}
          <a href="/api/auth/logout">Sign out</a>
        </p>
      </header>

      <section style={card}>
        <label style={label}>Store logo</label>
        <p style={{ ...hint, marginTop: 0 }}>
          The branding image for this branch. It stays with every promotion.
        </p>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`${props.placeName} logo`}
            style={{ width: 96, height: 96, objectFit: "contain", marginTop: 8 }}
          />
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <label style={{ ...secondaryBtn, display: "inline-block" }}>
            {logoUrl ? "Replace logo" : "Add logo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Store logo"
              style={{ display: "none" }}
              onChange={(e) => {
                onLogo(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
          {logoUrl ? (
            <button type="button" onClick={onClearLogo} disabled={pending} style={secondaryBtn}>
              Remove
            </button>
          ) : null}
        </div>
      </section>

      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <label style={{ ...label, marginBottom: 0 }}>
            {draft.id ? "Edit promotion" : "New promotion"}
          </label>
          {draft.id ? (
            <button type="button" onClick={() => setDraft(blankDraft())} style={linkBtn}>
              New
            </button>
          ) : null}
        </div>
        <label style={{ ...label, marginTop: 10 }}>
          Match words
          <textarea
            value={draft.keywords}
            onChange={(e) => patch({ keywords: e.target.value })}
            placeholder={"pasta sauce\ntomato sauce"}
            aria-label="Match words"
            rows={3}
            style={{ ...input, width: "100%", marginTop: 6, resize: "vertical" }}
          />
        </label>
        <p style={hint}>One phrase per line. The shopper's question must include each word.</p>
        <label style={label}>
          Offer text
          <textarea
            value={draft.body}
            onChange={(e) => patch({ body: e.target.value })}
            placeholder="Pasta sauce is 20% off this week."
            aria-label="Offer text"
            rows={3}
            style={{ ...input, width: "100%", marginTop: 6, resize: "vertical" }}
          />
        </label>
        <label style={{ ...label, marginTop: 10 }}>
          Image prompt
          <textarea
            value={draft.imagePrompt}
            onChange={(e) => patch({ imagePrompt: e.target.value })}
            placeholder="A simple grocery coupon for pasta sauce, 20% off, large readable type"
            aria-label="Image prompt"
            rows={3}
            style={{ ...input, width: "100%", marginTop: 6, resize: "vertical" }}
          />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={onGenerate}
            disabled={pending || !draft.imagePrompt.trim()}
            style={secondaryBtn}
          >
            {pending ? "Working…" : "Generate image"}
          </button>
          <label style={{ ...secondaryBtn, display: "inline-block" }}>
            Upload image
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Upload promotion image"
              style={{ display: "none" }}
              onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {draft.imageUrl ? (
          <img
            src={draft.imageUrl}
            alt="Promotion"
            style={{ width: "100%", marginTop: 12, borderRadius: 8 }}
          />
        ) : (
          <p style={hint}>Text only is fine. Add a picture when you want one sent too.</p>
        )}
        <label style={{ ...label, marginTop: 10 }}>
          Starts
          <input
            type="datetime-local"
            value={draft.startsLocal}
            onChange={(e) => patch({ startsLocal: e.target.value })}
            aria-label="Promotion start"
            style={{ ...input, width: "100%", marginTop: 6 }}
          />
        </label>
        <label style={{ ...label, marginTop: 10 }}>
          Duration in days
          <input
            type="number"
            min={1}
            step={1}
            value={draft.durationDays}
            onChange={(e) => patch({ durationDays: e.target.value })}
            aria-label="Promotion duration in days"
            style={{ ...input, width: "100%", marginTop: 6 }}
          />
        </label>
        <p style={hint}>
          {end
            ? `Ends ${end.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
            : "Enter a start and a duration."}
        </p>
        <button type="button" onClick={onSave} disabled={pending} style={primaryBtn}>
          {pending ? "Saving…" : "Save promotion"}
        </button>
      </section>

      <section style={card}>
        <label style={label}>This branch</label>
        {promotions.length === 0 ? (
          <p style={{ ...hint, marginTop: 0 }}>No promotions yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {promotions.map((row) => (
              <li
                key={row.id}
                style={{
                  padding: "10px 0",
                  borderTop: "1px solid #eee",
                  display: "flex",
                  gap: 10,
                }}
              >
                {row.image_url ? (
                  <img
                    src={row.image_url}
                    alt=""
                    style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }}
                  />
                ) : null}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#666" }}>{windowLabel(row, now)}</div>
                  <div style={{ fontWeight: 600 }}>{row.keywords}</div>
                  {row.body ? <div style={{ fontSize: 14 }}>{row.body}</div> : null}
                  <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(draftFromPromotion(row));
                        setStatus(null);
                        setError(null);
                      }}
                      style={linkBtn}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(row.id)}
                      disabled={pending}
                      style={{ ...linkBtn, color: "#b71c1c" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
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
  margin: "6px 0 0",
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
  marginTop: 10,
};

const secondaryBtn: CSSProperties = {
  fontSize: 16,
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#fff",
  color: "#111",
};

const linkBtn: CSSProperties = {
  border: "none",
  background: "none",
  color: "#0b5fff",
  fontSize: 15,
  padding: 0,
};
