"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";

import {
  addMapperItem,
  applyMapperText,
  clearMapperZoneItems,
  fetchZoneInventory,
  refreshMapperZones,
  removeMapperItem,
  type MapperPose,
} from "./actions";
import { compressImageForUpload } from "@/lib/vision/compress-image-client";
import { MAX_PROCESS_PHOTOS } from "@/lib/vision/constants";
import type { ZoneItemRow, ZoneListRow } from "@/lib/supabase/store";

type ProcessPhotosApiResult =
  | {
      ok: true;
      draftText: string;
      item_count: number;
      failures: Array<{ image_index: number; error: string }>;
    }
  | { ok: false; error: string };

function mergeDraftTexts(drafts: string[]): string {
  const cleaned = drafts.map((d) => d.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];

  const zonePrefix = cleaned[0].split(".")[0]?.trim() || cleaned[0];
  const items = new Set<string>();
  for (const draft of cleaned) {
    const dot = draft.indexOf(".");
    const rest = dot >= 0 ? draft.slice(dot + 1) : draft;
    for (const part of rest.split(",")) {
      const name = part.trim();
      if (name) items.add(name);
    }
  }
  if (items.size === 0) return zonePrefix;
  return `${zonePrefix}. ${Array.from(items).join(", ")}`;
}

/** Rough prior for first photo before we have timings (~OpenAI vision + RTT). */
const DEFAULT_SECONDS_PER_PHOTO = 18;
const COMPRESS_SECONDS_PER_PHOTO = 0.4;

type ExtractProgress = {
  phase: "compressing" | "extracting";
  current: number;
  total: number;
  /** 0–100 */
  percent: number;
  label: string;
  etaLabel: string;
};

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `~${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 10) return rem === 0 ? `~${m} min` : `~${m}m ${rem}s`;
  return `~${m} min`;
}

function estimateEtaSeconds(input: {
  phase: "compressing" | "extracting";
  total: number;
  elapsedMs: number;
  completedExtracts: number;
  /** Photos still queued including the one in flight */
  remainingExtracts: number;
}): number {
  const avgExtractSec =
    input.completedExtracts > 0
      ? input.elapsedMs / 1000 / input.completedExtracts
      : DEFAULT_SECONDS_PER_PHOTO;

  if (input.phase === "compressing") {
    return (
      input.remainingExtracts * COMPRESS_SECONDS_PER_PHOTO +
      input.total * avgExtractSec
    );
  }

  // In-flight photo: credit elapsed time since last completion against avg
  if (input.remainingExtracts <= 0) return 0;
  const sinceLastCompleteMs =
    input.completedExtracts > 0
      ? input.elapsedMs - input.completedExtracts * avgExtractSec * 1000
      : input.elapsedMs;
  const currentRemaining = Math.max(
    3,
    avgExtractSec - Math.max(0, sinceLastCompleteMs) / 1000
  );
  const afterCurrent = Math.max(0, input.remainingExtracts - 1) * avgExtractSec;
  return currentRemaining + afterCurrent;
}

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  start: () => void;
};

type Props = {
  placeId: string;
  placeName: string;
  placeAddress: string | null;
  initialZones: ZoneListRow[];
  layoutVersionId: string | null;
};

function cardinal(deg: number | null): string {
  if (deg == null || Number.isNaN(deg)) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const i = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return dirs[i];
}

export function MapperClient(props: Props) {
  const [zones, setZones] = useState(props.initialZones);
  const [text, setText] = useState("");
  const [stickyType, setStickyType] = useState("aisle");
  const [stickyLabel, setStickyLabel] = useState("");
  const [heading, setHeading] = useState<number | null>(null);
  const [coords, setCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number | null;
  } | null>(null);
  const [poseError, setPoseError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [inspectItems, setInspectItems] = useState<ZoneItemRow[]>([]);
  const [addItemName, setAddItemName] = useState("");
  const [saveMode, setSaveMode] = useState<"append" | "replace">("append");
  const [photos, setPhotos] = useState<Array<{ file: File; url: string }>>([]);
  const [extractProgress, setExtractProgress] = useState<ExtractProgress | null>(
    null
  );
  const [listening, setListening] = useState(false);
  const [pending, startTransition] = useTransition();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const extractStartedAtRef = useRef(0);
  const etaTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearEtaTick() {
    if (etaTickRef.current != null) {
      clearInterval(etaTickRef.current);
      etaTickRef.current = null;
    }
  }

  useEffect(() => () => clearEtaTick(), []);

  const pose: MapperPose = useMemo(
    () => ({
      heading_deg: heading,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      accuracy_m: coords?.accuracy ?? null,
    }),
    [heading, coords]
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      return;
    }
    const onOrient = (e: DeviceOrientationEvent) => {
      // webkitCompassHeading (iOS) or alpha
      const wk = (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading;
      if (typeof wk === "number") {
        setHeading(wk);
        return;
      }
      if (typeof e.alpha === "number") {
        setHeading((360 - e.alpha + 360) % 360);
      }
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setPoseError("Geolocation unavailable");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        });
        setPoseError(null);
      },
      (err) => setPoseError(err.message),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const stickyReady = Boolean(stickyLabel.trim());

  const submitText = useCallback(() => {
    const value = text.trim();
    if (!value) {
      setError("Type or speak something first");
      return;
    }
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const res = await applyMapperText({
        place_id: props.placeId,
        text: value,
        sticky_zone_type: stickyReady ? stickyType : null,
        sticky_zone_label: stickyReady ? stickyLabel.trim() : null,
        mode: saveMode,
        publish: true,
        pose,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setZones(res.zones);
      setStickyType(res.zone.zone_type);
      setStickyLabel(res.zone.zone_label);
      setText("");
      setStatus(
        `${saveMode === "replace" ? "Replaced" : "Saved"} ${res.zone.zone_type} ${res.zone.zone_label}` +
          (res.items_added ? ` · ${res.items_added} item(s)` : "") +
          (res.published ? " · published" : "")
      );
      setInspectId(res.zone.id);
    });
  }, [
    text,
    stickyReady,
    stickyType,
    stickyLabel,
    saveMode,
    pose,
    props.placeId,
  ]);

  useEffect(() => {
    if (!inspectId) {
      setInspectItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetchZoneInventory(inspectId);
      if (cancelled) return;
      if (res.ok) setInspectItems(res.items);
    })();
    return () => {
      cancelled = true;
    };
  }, [inspectId, zones]);

  function startSpeech() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setError("Speech recognition not supported in this browser");
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => {
      setListening(false);
      setError("Speech failed");
    };
    rec.onresult = (ev) => {
      const said = ev.results[0]?.[0]?.transcript?.trim();
      if (said) setText((prev) => (prev ? `${prev} ${said}` : said));
    };
    rec.start();
  }

  function onPhotos(files: FileList | null) {
    if (!files?.length) return;
    const next = Array.from(files).map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPhotos((prev) => {
      const merged = [...prev, ...next].slice(0, MAX_PROCESS_PHOTOS);
      // revoke previews that were dropped
      for (const p of prev) {
        if (!merged.includes(p)) URL.revokeObjectURL(p.url);
      }
      return merged;
    });
  }

  function clearPhotos() {
    for (const p of photos) URL.revokeObjectURL(p.url);
    setPhotos([]);
  }

  function processPhotos() {
    if (!photos.length) {
      setError("Take or add at least one photo");
      return;
    }
    if (!stickyReady) {
      setError("Set sticky zone (e.g. aisle 9) before processing photos");
      return;
    }
    setError(null);
    setStatus(null);
    const batch = photos.slice(0, MAX_PROCESS_PHOTOS);
    const total = batch.length;
    const initialEta = formatDuration(
      total * COMPRESS_SECONDS_PER_PHOTO + total * DEFAULT_SECONDS_PER_PHOTO
    );
    extractStartedAtRef.current = Date.now();
    setExtractProgress({
      phase: "compressing",
      current: 0,
      total,
      percent: 2,
      label: `Preparing ${total} photo${total === 1 ? "" : "s"}…`,
      etaLabel: `About ${initialEta} remaining`,
    });

    startTransition(async () => {
      try {
        const compressed: File[] = [];
        for (let i = 0; i < batch.length; i++) {
          const elapsedMs = Date.now() - extractStartedAtRef.current;
          const etaSec = estimateEtaSeconds({
            phase: "compressing",
            total,
            elapsedMs,
            completedExtracts: 0,
            remainingExtracts: total - i,
          });
          setExtractProgress({
            phase: "compressing",
            current: i + 1,
            total,
            percent: Math.round(((i + 0.5) / total) * 8),
            label: `Compressing photo ${i + 1} of ${total}…`,
            etaLabel: `About ${formatDuration(etaSec)} remaining`,
          });
          compressed.push(await compressImageForUpload(batch[i].file));
        }

        // One image per request — multi-file Server Actions crash on Vercel
        // body limits; batched vision also times out serverless defaults.
        const drafts: string[] = [];
        let itemCount = 0;
        let completedExtracts = 0;
        const failures: Array<{ image_index: number; error: string }> = [];
        const extractDurationsMs: number[] = [];

        for (let i = 0; i < compressed.length; i++) {
          const photoStart = Date.now();
          const remainingExtracts = total - i;
          const percent = Math.min(99, Math.round(8 + (i / total) * 92));

          const pushExtractProgress = (label: string) => {
            const elapsedMs = Date.now() - extractStartedAtRef.current;
            const etaSec = estimateEtaSeconds({
              phase: "extracting",
              total,
              elapsedMs,
              completedExtracts,
              remainingExtracts,
            });
            const etaLabel = `About ${formatDuration(etaSec)} remaining`;
            setExtractProgress({
              phase: "extracting",
              current: i + 1,
              total,
              percent,
              label,
              etaLabel,
            });
            setStatus(
              `Extracting photo ${i + 1} of ${total} · about ${formatDuration(etaSec)} left`
            );
          };

          pushExtractProgress(`Extracting photo ${i + 1} of ${total}…`);
          clearEtaTick();
          etaTickRef.current = setInterval(() => {
            pushExtractProgress(`Extracting photo ${i + 1} of ${total}…`);
          }, 1000);

          const formData = new FormData();
          formData.set("place_id", props.placeId);
          formData.set("sticky_zone_type", stickyType);
          formData.set("sticky_zone_label", stickyLabel.trim());
          formData.append("photos", compressed[i]);

          let response: Response;
          try {
            response = await fetch("/api/map/process-photos", {
              method: "POST",
              body: formData,
            });
          } finally {
            clearEtaTick();
          }

          let res: ProcessPhotosApiResult;
          try {
            res = (await response.json()) as ProcessPhotosApiResult;
          } catch {
            setExtractProgress(null);
            setError(
              `Photo ${i + 1} failed (${response.status}). Try again with fewer shots.`
            );
            return;
          }

          extractDurationsMs.push(Date.now() - photoStart);
          completedExtracts += 1;

          if (!res.ok) {
            failures.push({ image_index: i + 1, error: res.error });
          } else {
            drafts.push(res.draftText);
            itemCount += res.item_count;
            for (const f of res.failures) {
              failures.push({
                image_index: i + 1,
                error: f.error,
              });
            }
          }

          const afterElapsed = Date.now() - extractStartedAtRef.current;
          const afterEta = estimateEtaSeconds({
            phase: "extracting",
            total,
            elapsedMs: afterElapsed,
            completedExtracts,
            remainingExtracts: total - completedExtracts,
          });
          setExtractProgress({
            phase: "extracting",
            current: i + 1,
            total,
            percent: Math.round(8 + ((i + 1) / total) * 92),
            label:
              i + 1 < total
                ? `Finished photo ${i + 1} of ${total}`
                : `Finishing draft…`,
            etaLabel:
              i + 1 < total
                ? `About ${formatDuration(afterEta)} remaining`
                : "Almost done",
          });
        }

        if (drafts.length === 0) {
          setExtractProgress(null);
          setError(
            failures[0]?.error ||
              "Vision extract failed for all photos. Try one photo at a time."
          );
          return;
        }

        const draftText = mergeDraftTexts(drafts);
        setText(draftText);
        const failNote =
          failures.length > 0
            ? ` · ${failures.length} image warning(s)`
            : "";
        const avgSec =
          extractDurationsMs.length > 0
            ? extractDurationsMs.reduce((a, b) => a + b, 0) /
              extractDurationsMs.length /
              1000
            : DEFAULT_SECONDS_PER_PHOTO;
        const elapsedSec = (Date.now() - extractStartedAtRef.current) / 1000;
        setStatus(
          `Draft ready · ~${itemCount} item hit(s) from ${drafts.length}/${batch.length} photo(s)${failNote}. Took ${formatDuration(elapsedSec)} (~${Math.round(avgSec)}s/photo). Edit Text/speak, then Add or Replace.`
        );
        setExtractProgress(null);
        clearPhotos();
      } catch (e) {
        clearEtaTick();
        setExtractProgress(null);
        setError(
          e instanceof Error
            ? e.message
            : "Process photos failed — try one image, or reload and retry."
        );
      }
    });
  }

  function onAddItem() {
    if (!inspectId || !addItemName.trim()) return;
    startTransition(async () => {
      const res = await addMapperItem({
        place_id: props.placeId,
        zone_id: inspectId,
        item_name: addItemName,
        publish: true,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setZones(res.zones);
      setAddItemName("");
      setStatus(`Added item · zone now ${res.item_count} row(s)`);
      const inv = await fetchZoneInventory(inspectId);
      if (inv.ok) setInspectItems(inv.items);
    });
  }

  function onRemoveItem(itemId: string, name: string) {
    if (!inspectId) return;
    if (!window.confirm(`Remove “${name}” from this zone?`)) return;
    startTransition(async () => {
      const res = await removeMapperItem({
        place_id: props.placeId,
        zone_id: inspectId,
        item_id: itemId,
        publish: true,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setZones(res.zones);
      setInspectItems(res.items);
      setStatus(`Removed “${name}” · ${res.item_count} left`);
    });
  }

  function onClearZone() {
    if (!inspectId || !inspectZone) return;
    if (
      !window.confirm(
        `Clear ALL items from ${inspectZone.zone_type} ${inspectZone.zone_label}? This publishes an empty zone.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await clearMapperZoneItems({
        place_id: props.placeId,
        zone_id: inspectId,
        publish: true,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setZones(res.zones);
      setInspectItems([]);
      setStatus(`Cleared ${inspectZone.zone_type} ${inspectZone.zone_label}`);
    });
  }

  async function reloadZones() {
    const res = await refreshMapperZones(props.placeId);
    if (res.ok) setZones(res.zones);
  }

  const inspectZone = zones.find((z) => z.id === inspectId) || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <p style={eyebrow}>Store mapper</p>
        <h1 style={{ margin: "0 0 4px", fontSize: "1.6rem" }}>{props.placeName}</h1>
        {props.placeAddress ? (
          <p style={{ margin: 0, color: "#666", fontSize: 14 }}>{props.placeAddress}</p>
        ) : null}
      </header>

      <section style={card}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div
            aria-hidden
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              border: "2px solid #111",
              position: "relative",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 4,
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              N
            </span>
            <span
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 3,
                height: 28,
                marginLeft: -1.5,
                marginTop: -28,
                background: "#c62828",
                transformOrigin: "bottom center",
                transform: `rotate(${heading ?? 0}deg)`,
                borderRadius: 2,
              }}
            />
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <div>
              <strong>{cardinal(heading)}</strong>
              {heading != null ? ` · ${Math.round(heading)}°` : " · compass pending"}
            </div>
            <div style={{ color: "#555" }}>
              {coords
                ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` +
                  (coords.accuracy != null
                    ? ` ±${Math.round(coords.accuracy)}m`
                    : "")
                : poseError || "Waiting for GPS…"}
            </div>
            <div style={{ color: "#888", fontSize: 12 }}>
              Optional — capture never blocked if missing
            </div>
          </div>
        </div>
      </section>

      <section style={card}>
        <label style={label}>Sticky zone</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={stickyType}
            onChange={(e) => setStickyType(e.target.value)}
            style={input}
          >
            <option value="aisle">aisle</option>
            <option value="section">section</option>
            <option value="shelf">shelf</option>
          </select>
          <input
            value={stickyLabel}
            onChange={(e) => setStickyLabel(e.target.value)}
            placeholder="9 or Frozen foods"
            style={{ ...input, flex: 1 }}
          />
        </div>
        <p style={hint}>
          Set once, then snap or say items. Text can also include the zone
          (“aisle 9. cereal, peanut butter”).
        </p>
      </section>

      <section style={card}>
        <label style={label}>Text / speak</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="aisle 9. cereal, peanut butter, jelly"
          style={{ ...input, resize: "vertical", width: "100%" }}
        />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 8,
            fontSize: 13,
            alignItems: "center",
          }}
        >
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="radio"
              name="saveMode"
              checked={saveMode === "append"}
              onChange={() => setSaveMode("append")}
            />
            Add to zone
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="radio"
              name="saveMode"
              checked={saveMode === "replace"}
              onChange={() => setSaveMode("replace")}
            />
            Replace all items in zone
          </label>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          <button type="button" onClick={submitText} disabled={pending} style={primaryBtn}>
            {pending
              ? "Saving…"
              : saveMode === "replace"
                ? "Replace & publish"
                : "Add & publish"}
          </button>
          <button type="button" onClick={startSpeech} style={secondaryBtn}>
            {listening ? "Listening…" : "Speak"}
          </button>
        </div>
      </section>

      <section style={card}>
        <label style={label}>Camera</label>
        <p style={{ ...hint, marginTop: 0, marginBottom: 10 }}>
          On a phone, <strong>Take photo</strong> opens the camera. Add several
          shots of the same zone, then process as a batch.
        </p>
        {/* Hidden inputs: capture forces camera on mobile; library allows multi-pick */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            onPhotos(e.target.files);
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            onPhotos(e.target.files);
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            style={primaryBtn}
          >
            Take photo
          </button>
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            style={secondaryBtn}
          >
            Add from library
          </button>
          {photos.length > 0 ? (
            <button type="button" onClick={clearPhotos} style={secondaryBtn}>
              Clear
            </button>
          ) : null}
        </div>
        {photos.length > 0 ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
                marginTop: 12,
              }}
            >
              {photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.url}
                  src={p.url}
                  alt=""
                  style={{
                    width: "100%",
                    aspectRatio: "1",
                    objectFit: "cover",
                    borderRadius: 8,
                    border: "1px solid #e5e5e5",
                  }}
                />
              ))}
            </div>
            <p style={hint}>
              {photos.length} photo(s) ready
              {!extractProgress
                ? ` · rough estimate ~${formatDuration(
                    photos.length * DEFAULT_SECONDS_PER_PHOTO
                  )} to process`
                : null}
            </p>
            <button
              type="button"
              onClick={processPhotos}
              disabled={pending || Boolean(extractProgress)}
              style={{ ...secondaryBtn, marginTop: 8 }}
            >
              {extractProgress ? "Processing…" : "Process photos"}
            </button>
            {extractProgress ? (
              <div
                style={{ marginTop: 12 }}
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    fontSize: 13,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{extractProgress.label}</span>
                  <span style={{ color: "#555", whiteSpace: "nowrap" }}>
                    {extractProgress.percent}%
                  </span>
                </div>
                <div
                  style={{
                    height: 10,
                    borderRadius: 999,
                    background: "#e8e8e8",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${extractProgress.percent}%`,
                      background: "#111",
                      borderRadius: 999,
                      transition: "width 0.35s ease",
                    }}
                  />
                </div>
                <p style={{ ...hint, marginTop: 8 }}>
                  {extractProgress.current} / {extractProgress.total}
                  {extractProgress.phase === "extracting" ? " extracted" : " prepared"}
                  {" · "}
                  {extractProgress.etaLabel}
                  {" · "}
                  ~{DEFAULT_SECONDS_PER_PHOTO}s/photo typical
                </p>
              </div>
            ) : (
              <p style={hint}>
                Up to {MAX_PROCESS_PHOTOS} shots · resized on device · extracted
                one-by-one. Does not publish until you Add or Replace.
              </p>
            )}
          </>
        ) : (
          <p style={hint}>
            Queue up to {MAX_PROCESS_PHOTOS} shelf shots for the sticky zone,
            then Process photos to draft items into Text/speak.
          </p>
        )}
      </section>

      {error ? <p style={{ color: "#b71c1c", margin: 0 }}>{error}</p> : null}
      {status ? <p style={{ color: "#1b5e20", margin: 0 }}>{status}</p> : null}

      <section style={card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <label style={{ ...label, marginBottom: 0 }}>Zones</label>
          <button type="button" onClick={() => void reloadZones()} style={linkBtn}>
            Refresh
          </button>
        </div>
        {zones.length === 0 ? (
          <p style={hint}>No zones yet — save your first aisle.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {zones.map((z) => (
              <li key={z.id}>
                <button
                  type="button"
                  onClick={() => setInspectId(z.id)}
                  style={{
                    ...zoneRow,
                    background: inspectId === z.id ? "#eef3ff" : "transparent",
                  }}
                >
                  <span>
                    {z.zone_type} {z.zone_label}
                  </span>
                  <span style={{ color: "#666" }}>{z.item_count} items</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {inspectZone ? (
        <section style={card}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
              Inspect · {inspectZone.zone_type} {inspectZone.zone_label}
            </h2>
            <button
              type="button"
              onClick={onClearZone}
              disabled={pending || inspectItems.length === 0}
              style={{ ...secondaryBtn, color: "#b71c1c", borderColor: "#ef9a9a" }}
            >
              Clear all
            </button>
          </div>
          <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0, fontSize: 14 }}>
            {inspectItems.length === 0 ? (
              <li style={{ color: "#666", padding: "6px 0" }}>No items yet</li>
            ) : (
              inspectItems.slice(0, 80).map((it) => {
                const name = it.canonical_name || it.raw_label || "item";
                return (
                  <li
                    key={it.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 0",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    <span>{name}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(it.id, name)}
                      disabled={pending}
                      style={linkBtn}
                    >
                      Remove
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          {inspectItems.length > 80 ? (
            <p style={hint}>Showing first 80…</p>
          ) : null}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={addItemName}
              onChange={(e) => setAddItemName(e.target.value)}
              placeholder="Add one item"
              style={{ ...input, flex: 1 }}
            />
            <button type="button" onClick={onAddItem} disabled={pending} style={primaryBtn}>
              Add
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

const eyebrow: CSSProperties = {
  margin: 0,
  fontSize: 12,
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
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
};

const hint: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12,
  color: "#777",
};

const input: CSSProperties = {
  fontSize: 16,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#fff",
};

const primaryBtn: CSSProperties = {
  fontSize: 15,
  padding: "10px 14px",
  borderRadius: 8,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 600,
};

const secondaryBtn: CSSProperties = {
  fontSize: 15,
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
  fontSize: 13,
  padding: 0,
};

const zoneRow: CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  padding: "10px 8px",
  border: "none",
  borderBottom: "1px solid #eee",
  background: "transparent",
  textAlign: "left",
  fontSize: 14,
};
