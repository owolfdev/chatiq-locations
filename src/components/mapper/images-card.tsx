"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  hasMapperToken,
  mapperAuthHeaders,
} from "@/lib/survey/mapper-token-client";
import { MAX_ASSETS_PER_CAPTURE_SET } from "@/lib/supabase/tables";
import { MAX_PROCESS_PHOTOS } from "@/lib/vision/constants";

type PhotoItem = {
  id: string;
  file: File;
  url: string;
  assetId?: string;
};

type CaptureSet = {
  id: string;
  zone_type: string;
  zone_label: string;
  status: string;
  asset_count: number;
  created_at: string;
};

export type ImagesExtractProgress = {
  phase: "compressing" | "extracting";
  current: number;
  total: number;
  percent: number;
  label: string;
  etaLabel: string;
};

type Props = {
  placeId: string;
  zoneReady: boolean;
  extractProgress: ImagesExtractProgress | null;
  pending: boolean;
  /** Resolves true when a draft was produced. */
  onProcess: (files: File[]) => Promise<boolean>;
  onStatus: (msg: string | null) => void;
  onError: (msg: string | null) => void;
};

function newLocalId() {
  return `local-${crypto.randomUUID()}`;
}

export function ImagesCard(props: Props) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loadedSetId, setLoadedSetId] = useState<string | null>(null);
  const [loadedSetName, setLoadedSetName] = useState<string | null>(null);
  const [sets, setSets] = useState<CaptureSet[]>([]);
  /** Selection in the set dropdown (may differ briefly while loading). */
  const [selectedSetId, setSelectedSetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<PhotoItem | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => {
    return () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.url);
    };
  }, []);

  const refreshSets = useCallback(async () => {
    if (!hasMapperToken()) return;
    const res = await fetch(
      `/api/survey/sets?place_id=${encodeURIComponent(props.placeId)}`,
      { headers: mapperAuthHeaders() }
    );
    const json = (await res.json()) as {
      ok: boolean;
      sets?: CaptureSet[];
      error?: string;
    };
    if (json.ok) setSets(json.sets || []);
  }, [props.placeId]);

  useEffect(() => {
    void refreshSets();
  }, [refreshSets]);

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const next = Array.from(files).map((file) => ({
      id: newLocalId(),
      file,
      url: URL.createObjectURL(file),
    }));
    setPhotos((prev) => {
      const merged = [...prev, ...next].slice(0, MAX_PROCESS_PHOTOS);
      for (const p of prev) {
        if (!merged.includes(p)) URL.revokeObjectURL(p.url);
      }
      return merged;
    });
  }

  function clearLocalPhotos() {
    for (const p of photos) URL.revokeObjectURL(p.url);
    setPhotos([]);
    setLoadedSetId(null);
    setLoadedSetName(null);
    setSelectedSetId("");
  }

  async function removePhoto(photo: PhotoItem) {
    if (!window.confirm("Remove this photo from the set?")) return;
    if (photo.assetId && hasMapperToken()) {
      setBusy(true);
      try {
        const res = await fetch(`/api/survey/assets/${photo.assetId}`, {
          method: "DELETE",
          headers: mapperAuthHeaders(),
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) {
          props.onError(json.error || "Failed to delete photo");
          setBusy(false);
          return;
        }
      } catch (e) {
        props.onError(e instanceof Error ? e.message : "Delete failed");
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    URL.revokeObjectURL(photo.url);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    if (detail?.id === photo.id) setDetail(null);
  }

  async function uploadPhotoToSet(setId: string, file: File) {
    const compressed = file; // compress happens on Process; save stores as-is for fidelity
    // Soft-compress via existing helper would be better for quota — keep file as provided.
    const beginRes = await fetch(`/api/survey/sets/${setId}/assets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...mapperAuthHeaders(),
      },
      body: JSON.stringify({
        content_type: compressed.type || "image/jpeg",
        byte_size: compressed.size,
      }),
    });
    const beginJson = (await beginRes.json()) as {
      ok: boolean;
      asset?: { id: string };
      upload_url?: string;
      error?: string;
    };
    if (!beginJson.ok || !beginJson.asset || !beginJson.upload_url) {
      throw new Error(beginJson.error || "Upload begin failed");
    }
    const put = await fetch(beginJson.upload_url, {
      method: "PUT",
      headers: { "Content-Type": compressed.type || "image/jpeg" },
      body: compressed,
    });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    await fetch(`/api/survey/assets/${beginJson.asset.id}/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...mapperAuthHeaders(),
      },
      body: JSON.stringify({ byte_size: compressed.size }),
    });
    return beginJson.asset.id;
  }

  async function saveSet(asNew: boolean) {
    if (!hasMapperToken()) {
      props.onError(
        "Open mapper with access_token to save photo sets (same as LOCATIONS_MAPPER_TOKEN)."
      );
      return;
    }
    if (photos.length === 0) {
      props.onError("Add at least one photo before saving a set");
      return;
    }

    let setId = loadedSetId;
    let setName = loadedSetName;

    if (asNew || !setId) {
      const name = window.prompt(
        "Name this photo set",
        setName || `Set ${new Date().toLocaleString()}`
      );
      if (!name?.trim()) return;
      setBusy(true);
      props.onError(null);
      try {
        const res = await fetch("/api/survey/sets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...mapperAuthHeaders(),
          },
          body: JSON.stringify({
            place_id: props.placeId,
            name: name.trim(),
          }),
        });
        const json = (await res.json()) as {
          ok: boolean;
          set?: CaptureSet;
          error?: string;
        };
        if (!json.ok || !json.set) {
          props.onError(json.error || "Failed to create set");
          setBusy(false);
          return;
        }
        setId = json.set.id;
        setName = json.set.zone_label;
        // Upload all current photos into the new set
        const withAssets: PhotoItem[] = [];
        for (const p of photos) {
          const assetId = await uploadPhotoToSet(setId, p.file);
          withAssets.push({ ...p, assetId });
        }
        setPhotos(withAssets);
        setLoadedSetId(setId);
        setLoadedSetName(setName);
        setSelectedSetId(setId);
        await refreshSets();
        props.onStatus(`Saved set “${setName}” · ${withAssets.length} photo(s)`);
      } catch (e) {
        props.onError(e instanceof Error ? e.message : "Save set failed");
      } finally {
        setBusy(false);
      }
      return;
    }

    // Update existing: upload only photos that aren't on the server yet
    setBusy(true);
    props.onError(null);
    try {
      const withAssets: PhotoItem[] = [];
      let added = 0;
      for (const p of photos) {
        if (p.assetId) {
          withAssets.push(p);
          continue;
        }
        const assetId = await uploadPhotoToSet(setId, p.file);
        withAssets.push({ ...p, assetId });
        added += 1;
      }
      setPhotos(withAssets);
      await refreshSets();
      props.onStatus(
        added > 0
          ? `Updated “${setName}” · added ${added} photo(s)`
          : `“${setName}” already up to date`
      );
    } catch (e) {
      props.onError(e instanceof Error ? e.message : "Save set failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadSet(set: CaptureSet) {
    if (!hasMapperToken()) {
      props.onError("access_token required to load sets");
      return;
    }
    setBusy(true);
    props.onError(null);
    try {
      const res = await fetch(`/api/survey/sets/${set.id}/assets`, {
        headers: mapperAuthHeaders(),
      });
      const json = (await res.json()) as {
        ok: boolean;
        assets?: Array<{
          id: string;
          download_url: string;
          content_type: string;
        }>;
        error?: string;
      };
      if (!json.ok || !json.assets) {
        props.onError(json.error || "Failed to load set");
        setBusy(false);
        return;
      }

      for (const p of photos) URL.revokeObjectURL(p.url);

      const loaded: PhotoItem[] = [];
      for (const asset of json.assets.slice(0, MAX_PROCESS_PHOTOS)) {
        const blobRes = await fetch(asset.download_url);
        if (!blobRes.ok) continue;
        const blob = await blobRes.blob();
        const file = new File(
          [blob],
          `${asset.id}.jpg`,
          { type: asset.content_type || "image/jpeg" }
        );
        loaded.push({
          id: asset.id,
          file,
          url: URL.createObjectURL(file),
          assetId: asset.id,
        });
      }
      setPhotos(loaded);
      setLoadedSetId(set.id);
      setLoadedSetName(set.zone_label);
      setSelectedSetId(set.id);
      props.onStatus(
        `Loaded “${set.zone_label}” · ${loaded.length} photo(s) — Process when ready`
      );
    } catch (e) {
      props.onError(e instanceof Error ? e.message : "Load set failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSetSelectChange(nextId: string) {
    setSelectedSetId(nextId);
    if (!nextId) {
      // Keep local photos; just detach from a saved set.
      setLoadedSetId(null);
      setLoadedSetName(null);
      return;
    }
    const set = sets.find((s) => s.id === nextId);
    if (set) await loadSet(set);
  }

  async function deleteSetById(setId: string, setName: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/survey/sets/${setId}`, {
        method: "DELETE",
        headers: mapperAuthHeaders(),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        props.onError(json.error || "Delete set failed");
        setBusy(false);
        return false;
      }
      if (loadedSetId === setId) {
        clearLocalPhotos();
        setSelectedSetId("");
      } else if (selectedSetId === setId) {
        setSelectedSetId("");
      }
      await refreshSets();
      props.onStatus(`Deleted set “${setName}” and its photos`);
      return true;
    } catch (e) {
      props.onError(e instanceof Error ? e.message : "Delete set failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedSet() {
    const id = selectedSetId || loadedSetId;
    if (!id) {
      props.onError("Choose a set to delete");
      return;
    }
    const name =
      sets.find((s) => s.id === id)?.zone_label || loadedSetName || "this set";
    if (
      !window.confirm(
        `Delete photo set “${name}” and all of its images from storage?`
      )
    ) {
      return;
    }
    await deleteSetById(id, name);
  }

  async function runProcess() {
    if (!props.zoneReady) {
      props.onError("Load or set an active zone before processing photos");
      return;
    }
    if (photos.length === 0) {
      props.onError("Add or load at least one photo");
      return;
    }
    const setId = loadedSetId;
    const setName = loadedSetName;
    const ok = await props.onProcess(photos.map((p) => p.file));
    if (!ok || !setId || !setName) return;
    if (
      window.confirm(
        `Draft ready. Delete set “${setName}” and its photos from storage? You can keep it if you want to re-process later.`
      )
    ) {
      await deleteSetById(setId, setName);
    }
  }

  const disabled = busy || props.pending || Boolean(props.extractProgress);

  return (
    <section style={card}>
      <label style={label}>Images</label>
      <p style={{ ...hint, marginTop: 0, marginBottom: 10 }}>
        Build a group of photos, optionally save/load a named set, then Process
        into Text/speak for the active zone.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <select
          value={selectedSetId}
          onChange={(e) => void onSetSelectChange(e.target.value)}
          disabled={disabled || !hasMapperToken()}
          style={{ ...input, flex: 1, minWidth: 160 }}
          aria-label="Photo set"
        >
          <option value="">
            {hasMapperToken()
              ? sets.length
                ? "Select a photo set…"
                : "No saved sets yet"
              : "access_token required for sets"}
          </option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.zone_label} ({s.asset_count})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void refreshSets()}
          disabled={disabled || !hasMapperToken()}
          style={secondaryBtn}
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => void deleteSelectedSet()}
          disabled={disabled || !(selectedSetId || loadedSetId)}
          style={{ ...secondaryBtn, color: "#b71c1c", borderColor: "#ef9a9a" }}
        >
          Delete set
        </button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          addFiles(e.target.files);
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
          addFiles(e.target.files);
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={disabled}
          style={primaryBtn}
        >
          Take photo
        </button>
        <button
          type="button"
          onClick={() => libraryRef.current?.click()}
          disabled={disabled}
          style={secondaryBtn}
        >
          Add from library
        </button>
        <button
          type="button"
          onClick={() => void saveSet(false)}
          disabled={disabled || photos.length === 0}
          style={secondaryBtn}
        >
          Save set
        </button>
        {loadedSetId ? (
          <button
            type="button"
            onClick={() => void saveSet(true)}
            disabled={disabled || photos.length === 0}
            style={secondaryBtn}
          >
            Save as…
          </button>
        ) : null}
        {photos.length > 0 ? (
          <button
            type="button"
            onClick={clearLocalPhotos}
            disabled={disabled}
            style={secondaryBtn}
          >
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
              <div key={p.id} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setDetail(p)}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: 0,
                    border: "1px solid #e5e5e5",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "#fff",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt=""
                    style={{
                      width: "100%",
                      aspectRatio: "1",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </button>
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => void removePhoto(p)}
                  disabled={disabled}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    border: "none",
                    background: "rgba(0,0,0,0.65)",
                    color: "#fff",
                    fontSize: 16,
                    lineHeight: "28px",
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <p style={hint}>
            {photos.length} photo(s)
            {loadedSetName ? ` in “${loadedSetName}”` : ""}
            {" · "}
            up to {Math.min(MAX_PROCESS_PHOTOS, MAX_ASSETS_PER_CAPTURE_SET)}{" "}
            shots
          </p>
          <button
            type="button"
            onClick={() => void runProcess()}
            disabled={disabled}
            style={{ ...secondaryBtn, marginTop: 8 }}
          >
            {props.extractProgress ? "Processing…" : "Process photos"}
          </button>
          {props.extractProgress ? (
            <div style={{ marginTop: 12 }} role="status" aria-live="polite">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  fontSize: 15,
                  marginBottom: 6,
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {props.extractProgress.label}
                </span>
                <span style={{ color: "#555", whiteSpace: "nowrap" }}>
                  {props.extractProgress.percent}%
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
                    width: `${props.extractProgress.percent}%`,
                    background: "#111",
                    borderRadius: 999,
                    transition: "width 0.35s ease",
                  }}
                />
              </div>
              <p style={{ ...hint, marginTop: 8 }}>
                {props.extractProgress.current} / {props.extractProgress.total}
                {" · "}
                {props.extractProgress.etaLabel}
              </p>
            </div>
          ) : (
            <p style={hint}>
              Process fills Text/speak only — nothing publishes until you Add or
              Replace.
            </p>
          )}
        </>
      ) : (
        <p style={hint}>
          Take or add photos, or load a saved set, then Process for the active
          zone.
        </p>
      )}

      {detail ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setDetail(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={detail.url}
            alt=""
            style={{
              maxWidth: "100%",
              maxHeight: "80vh",
              objectFit: "contain",
              borderRadius: 8,
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setDetail(null)}
            style={{ ...primaryBtn, marginTop: 16 }}
          >
            Close
          </button>
        </div>
      ) : null}
    </section>
  );
}

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

const primaryBtn: CSSProperties = {
  fontSize: 16,
  padding: "10px 14px",
  borderRadius: 8,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 600,
};

const secondaryBtn: CSSProperties = {
  fontSize: 16,
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#fff",
  color: "#111",
};

const input: CSSProperties = {
  fontSize: 17,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#fff",
};
