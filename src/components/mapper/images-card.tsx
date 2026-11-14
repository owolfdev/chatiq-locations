"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { LiveCameraSheet } from "@/components/mapper/live-camera-sheet";
import {
  mapperAuthHeaders,
  readMapperToken,
} from "@/lib/survey/mapper-token-client";
import {
  createPhoneSet,
  deletePhonePhoto,
  deletePhoneSet,
  listPhoneSets,
  listPhoneUploads,
  loadPhoneSetPhotos,
  markPhonePhotoUploaded,
  replacePhoneSetPhotos,
  setPhoneServerSetId,
  type PhonePhotoSet,
} from "@/lib/survey/phone-photo-store";
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
  draft_text: string | null;
  created_at: string;
};

type CopyProgress = {
  phase: "phone" | "uploading" | "paused" | "saved" | "error";
  current: number;
  total: number;
  label: string;
  detail?: string;
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
  zoneType: string;
  zoneLabel: string;
  extractProgress: ImagesExtractProgress | null;
  pending: boolean;
  /** Resolves true when a draft was produced. */
  onProcess: (files: File[]) => Promise<boolean>;
  onDraft: (draft: { text: string; zoneType: string; zoneLabel: string }) => void;
  onStatus: (msg: string | null) => void;
  onError: (msg: string | null) => void;
  /** Signed-in mapper: survey calls use the session cookie. */
  sessionUploads?: boolean;
};

function newLocalId() {
  return `local-${crypto.randomUUID()}`;
}

export function ImagesCard(props: Props) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loadedSetId, setLoadedSetId] = useState<string | null>(null);
  const [loadedSetName, setLoadedSetName] = useState<string | null>(null);
  const [sets, setSets] = useState<CaptureSet[]>([]);
  const [phoneSets, setPhoneSets] = useState<PhonePhotoSet[]>([]);
  /** Selection in the set dropdown (`phone:` or `server:` prefix). */
  const [selectedSetId, setSelectedSetId] = useState("");
  const [loadedSource, setLoadedSource] = useState<"phone" | "server" | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<PhotoItem | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [copy, setCopy] = useState<CopyProgress | null>(null);
  const canSurvey = Boolean(props.sessionUploads) || readMapperToken().length > 0;
  const onStatusRef = useRef(props.onStatus);
  const onErrorRef = useRef(props.onError);
  onStatusRef.current = props.onStatus;
  onErrorRef.current = props.onError;
  const drainLock = useRef(false);
  const drainAgain = useRef(false);
  const processLock = useRef(false);
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
    if (!canSurvey) return;
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
  }, [canSurvey, props.placeId]);

  const refreshPhoneSets = useCallback(async () => {
    const rows = await listPhoneSets(props.placeId);
    setPhoneSets(rows);
    return rows;
  }, [props.placeId]);

  useEffect(() => {
    void refreshSets();
    void refreshPhoneSets().catch(() => {
      onErrorRef.current("Could not read photo sets saved on this phone");
    });
  }, [refreshSets, refreshPhoneSets]);

  function addFileList(files: File[]) {
    if (!files.length) return;
    const next = files.map((file) => ({
      id: newLocalId(),
      file,
      url: URL.createObjectURL(file),
    }));
    setPhotos((prev) => {
      const room = MAX_PROCESS_PHOTOS - prev.length;
      const accepted = next.slice(0, Math.max(0, room));
      for (const skipped of next.slice(accepted.length)) {
        URL.revokeObjectURL(skipped.url);
      }
      return [...prev, ...accepted];
    });
  }

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    addFileList(Array.from(files));
  }

  function clearLocalPhotos() {
    for (const p of photos) URL.revokeObjectURL(p.url);
    setPhotos([]);
    setLoadedSetId(null);
    setLoadedSetName(null);
    setLoadedSource(null);
    setSelectedSetId("");
  }

  async function removePhoto(photo: PhotoItem) {
    if (!window.confirm("Remove this photo from the set?")) return;
    if (photo.assetId && canSurvey) {
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
    if (loadedSource === "phone") {
      try {
        await deletePhonePhoto(photo.id);
      } catch {
        /* the grid update still stands; the next save rewrites the set */
      }
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

  async function createServerSet(name: string) {
    const res = await fetch("/api/survey/sets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...mapperAuthHeaders(),
      },
      body: JSON.stringify({
        place_id: props.placeId,
        name,
        zone_type: "album",
      }),
    });
    const json = (await res.json()) as {
      ok: boolean;
      set?: CaptureSet;
      error?: string;
    };
    if (!json.ok || !json.set) {
      throw new Error(json.error || "Could not start the server copy");
    }
    return json.set.id;
  }

  function mapperInBackground() {
    return document.visibilityState !== "visible";
  }

  async function drainUploads() {
    if (!canSurvey) return;
    if (drainLock.current) {
      drainAgain.current = true;
      return;
    }
    drainLock.current = true;
    try {
      do {
        drainAgain.current = false;
        const jobs = await listPhoneUploads(props.placeId);
        if (jobs.length === 0) {
          setCopy((prev) =>
            prev && (prev.phase === "uploading" || prev.phase === "phone")
              ? {
                  phase: "saved",
                  current: prev.total,
                  total: prev.total,
                  label: "Server copy saved",
                }
              : prev
          );
          continue;
        }
        for (const job of jobs) {
          if (mapperInBackground()) {
            const done = job.photos.filter((photo) => photo.serverAssetId).length;
            setCopy({
              phase: "paused",
              current: done,
              total: job.photos.length,
              label: "Copy paused",
              detail: "Keep the mapper open to continue saving a copy.",
            });
            return;
          }
          let serverSetId = job.set.serverSetId;
          if (!serverSetId) {
            serverSetId = await createServerSet(job.set.name);
            await setPhoneServerSetId(job.set.id, serverSetId);
          }
          const pending = job.photos.filter((photo) => !photo.serverAssetId);
          let done = job.photos.length - pending.length;
          for (const photo of pending) {
            if (mapperInBackground()) {
              setCopy({
                phase: "paused",
                current: done,
                total: job.photos.length,
                label: "Copy paused",
                detail: "Keep the mapper open to continue saving a copy.",
              });
              return;
            }
            setCopy({
              phase: "uploading",
              current: done + 1,
              total: job.photos.length,
              label: `Saving a copy · ${done + 1} of ${job.photos.length}`,
              detail: job.set.name,
            });
            const file = new File([photo.blob], `${photo.id}.jpg`, {
              type: photo.contentType || "image/jpeg",
            });
            const assetId = await uploadPhotoToSet(serverSetId, file);
            await markPhonePhotoUploaded(photo.id, assetId);
            done += 1;
            setPhotos((prev) =>
              prev.map((item) =>
                item.id === photo.id ? { ...item, assetId } : item
              )
            );
          }
        }
        const remaining = await listPhoneUploads(props.placeId);
        if (remaining.length === 0) {
          const total = jobs.reduce((sum, job) => sum + job.photos.length, 0);
          setCopy({
            phase: "saved",
            current: total,
            total,
            label: "Server copy saved",
          });
        }
      } while (drainAgain.current);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Server copy failed";
      setCopy({
        phase: "error",
        current: 0,
        total: 0,
        label: "Server copy stopped",
        detail: message,
      });
      onErrorRef.current(message);
    } finally {
      drainLock.current = false;
    }
  }

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") void drainUploads();
    };
    document.addEventListener("visibilitychange", onVisibility);
    void drainUploads();
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // Resume copies when this store is open. drainUploads is recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.placeId, canSurvey]);

  async function persistGallery(setId: string, gallery: PhotoItem[]) {
    await replacePhoneSetPhotos(
      setId,
      gallery.map((photo) => ({
        id: photo.id,
        blob: photo.file,
        contentType: photo.file.type || "image/jpeg",
        serverAssetId: photo.assetId || null,
      }))
    );
  }

  async function ensurePhoneSet(gallery: PhotoItem[]): Promise<PhonePhotoSet> {
    if (loadedSource === "phone" && loadedSetId) {
      const existing = phoneSets.find((set) => set.id === loadedSetId);
      if (existing) {
        await persistGallery(existing.id, gallery);
        return existing;
      }
    }
    const stamp = new Date().toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const name = `${props.zoneType} ${props.zoneLabel.trim()} · ${stamp}`;
    const created = await createPhoneSet({ placeId: props.placeId, name });
    await persistGallery(created.id, gallery);
    setPhoneSets((prev) => [created, ...prev.filter((set) => set.id !== created.id)]);
    setLoadedSetId(created.id);
    setLoadedSetName(created.name);
    setLoadedSource("phone");
    setSelectedSetId(`phone:${created.id}`);
    return created;
  }

  async function saveSet(asNew: boolean) {
    if (photos.length === 0) {
      props.onError("Add at least one photo before saving a set");
      return;
    }

    const renaming = asNew || loadedSource !== "phone" || !loadedSetId;
    let setId = loadedSource === "phone" ? loadedSetId : null;
    let setName = loadedSetName;

    if (renaming || !setId) {
      const name = window.prompt(
        "Name this photo set",
        setName || `${props.zoneType} ${props.zoneLabel.trim() || "photos"}`
      );
      if (!name?.trim()) return;
      setBusy(true);
      props.onError(null);
      try {
        const created = await createPhoneSet({
          placeId: props.placeId,
          name: name.trim(),
        });
        await persistGallery(created.id, photos);
        setId = created.id;
        setName = created.name;
        setPhoneSets((prev) => [created, ...prev]);
        setLoadedSetId(created.id);
        setLoadedSetName(created.name);
        setLoadedSource("phone");
        setSelectedSetId(`phone:${created.id}`);
        props.onStatus(`Saved “${created.name}” on this phone · ${photos.length} photo(s)`);
        setCopy({
          phase: "phone",
          current: photos.length,
          total: photos.length,
          label: `Saved on this phone · ${photos.length} photo(s)`,
          detail: canSurvey ? "Starting the server copy…" : "Sign in to keep a server copy.",
        });
        void drainUploads();
      } catch (e) {
        props.onError(e instanceof Error ? e.message : "Save set failed");
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    props.onError(null);
    try {
      await persistGallery(setId, photos);
      props.onStatus(`Saved “${setName}” on this phone · ${photos.length} photo(s)`);
      setCopy({
        phase: "phone",
        current: photos.length,
        total: photos.length,
        label: `Saved on this phone · ${photos.length} photo(s)`,
        detail: canSurvey ? "Starting the server copy…" : "Sign in to keep a server copy.",
      });
      void drainUploads();
    } catch (e) {
      props.onError(e instanceof Error ? e.message : "Save set failed");
    } finally {
      setBusy(false);
    }
  }

  function showLoadedPhotos(next: PhotoItem[], name: string) {
    for (const p of photos) URL.revokeObjectURL(p.url);
    setPhotos(next);
    props.onStatus(`Loaded “${name}” · ${next.length} photo(s). Process when ready.`);
  }

  async function loadPhone(set: PhonePhotoSet) {
    setBusy(true);
    props.onError(null);
    try {
      const rows = await loadPhoneSetPhotos(set.id);
      const loaded: PhotoItem[] = rows.slice(0, MAX_PROCESS_PHOTOS).map((row) => {
        const file = new File([row.blob], `${row.id}.jpg`, {
          type: row.contentType || "image/jpeg",
        });
        return {
          id: row.id,
          file,
          url: URL.createObjectURL(file),
          assetId: row.serverAssetId || undefined,
        };
      });
      showLoadedPhotos(loaded, set.name);
      setLoadedSetId(set.id);
      setLoadedSetName(set.name);
      setLoadedSource("phone");
      setSelectedSetId(`phone:${set.id}`);
    } catch (e) {
      props.onError(e instanceof Error ? e.message : "Load set failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadSet(set: CaptureSet) {
    if (!canSurvey) {
      props.onError("Sign in to load sets");
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
      showLoadedPhotos(loaded, set.zone_label);
      setLoadedSetId(set.id);
      setLoadedSetName(set.zone_label);
      setLoadedSource("server");
      setSelectedSetId(`server:${set.id}`);
    } catch (e) {
      props.onError(e instanceof Error ? e.message : "Load set failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSetSelectChange(nextId: string) {
    setSelectedSetId(nextId);
    if (!nextId) {
      setLoadedSetId(null);
      setLoadedSetName(null);
      setLoadedSource(null);
      return;
    }
    if (nextId.startsWith("phone:")) {
      const set = phoneSets.find((row) => row.id === nextId.slice("phone:".length));
      if (set) await loadPhone(set);
      return;
    }
    if (nextId.startsWith("server:")) {
      const set = sets.find((row) => row.id === nextId.slice("server:".length));
      if (set) await loadSet(set);
    }
  }

  async function deleteServerSet(setId: string) {
    const res = await fetch(`/api/survey/sets/${setId}`, {
      method: "DELETE",
      headers: mapperAuthHeaders(),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) throw new Error(json.error || "Delete set failed");
  }

  async function deleteSelectedSet() {
    if (!selectedSetId) {
      props.onError("Choose a set to delete");
      return;
    }
    const phoneId = selectedSetId.startsWith("phone:")
      ? selectedSetId.slice("phone:".length)
      : null;
    const serverId = selectedSetId.startsWith("server:")
      ? selectedSetId.slice("server:".length)
      : null;
    const phone = phoneId ? phoneSets.find((set) => set.id === phoneId) : null;
    const server = serverId ? sets.find((set) => set.id === serverId) : null;
    const name = phone?.name || server?.zone_label || loadedSetName || "this set";
    if (
      !window.confirm(
        `Delete photo set “${name}” from this phone${
          phone?.serverSetId || server ? " and the server copy" : ""
        }?`
      )
    ) {
      return;
    }
    setBusy(true);
    props.onError(null);
    try {
      if (phone) {
        await deletePhoneSet(phone.id);
        if (phone.serverSetId && canSurvey) await deleteServerSet(phone.serverSetId);
        setPhoneSets((prev) => prev.filter((set) => set.id !== phone.id));
      } else if (server && canSurvey) {
        await deleteServerSet(server.id);
      }
      if (
        (phone && loadedSetId === phone.id) ||
        (server && loadedSetId === server.id)
      ) {
        clearLocalPhotos();
      }
      setSelectedSetId("");
      await refreshSets();
      props.onStatus(`Deleted “${name}”`);
    } catch (e) {
      props.onError(e instanceof Error ? e.message : "Delete set failed");
    } finally {
      setBusy(false);
    }
  }

  async function runProcess() {
    if (processLock.current) return;
    if (!props.zoneReady || !props.zoneLabel.trim()) {
      props.onError("Load or set an active zone before processing photos");
      return;
    }
    if (photos.length === 0) {
      props.onError("Add or load at least one photo");
      return;
    }
    processLock.current = true;
    props.onError(null);
    setCopy({
      phase: "phone",
      current: 0,
      total: photos.length,
      label: `Saving ${photos.length} photo${photos.length === 1 ? "" : "s"} on this phone…`,
    });
    try {
      if (loadedSource === "phone" && loadedSetId) {
        await persistGallery(loadedSetId, photos);
      } else if (loadedSource !== "server") {
        await ensurePhoneSet(photos);
      }
      void drainUploads();
      await props.onProcess(photos.map((photo) => photo.file));
    } catch (e) {
      props.onError(e instanceof Error ? e.message : "Process failed");
    } finally {
      processLock.current = false;
    }
  }

  const disabled = busy || props.pending || Boolean(props.extractProgress);

  return (
    <section style={card}>
      <label style={label}>Images</label>
      <p style={{ ...hint, marginTop: 0, marginBottom: 10 }}>
        Photos stay on this phone. Process starts from them and shows each
        photo as it finishes. A server copy uploads only while this page is open.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <select
          value={selectedSetId}
          onChange={(e) => void onSetSelectChange(e.target.value)}
          disabled={disabled}
          style={{ ...input, flex: 1, minWidth: 160 }}
          aria-label="Photo set"
        >
          <option value="">
            {phoneSets.length || sets.length
              ? "Select a photo set…"
              : "No saved sets yet"}
          </option>
          {phoneSets.map((set) => (
            <option key={set.id} value={`phone:${set.id}`}>
              {set.name}
            </option>
          ))}
          {sets
            .filter(
              (set) => !phoneSets.some((phone) => phone.serverSetId === set.id)
            )
            .map((set) => (
              <option key={set.id} value={`server:${set.id}`}>
                {set.zone_label} ({set.asset_count}) · on server
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={() => {
            void refreshPhoneSets();
            void refreshSets();
          }}
          disabled={disabled}
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
          onClick={() => {
            if (!navigator.mediaDevices?.getUserMedia) {
              cameraRef.current?.click();
              return;
            }
            props.onError(null);
            setCameraOpen(true);
          }}
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
            {props.extractProgress
              ? "Processing…"
              : copy?.phase === "phone"
                ? "Saving…"
                : "Process photos"}
          </button>
          {copy ? (
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
                <span style={{ fontWeight: 600 }}>{copy.label}</span>
                {copy.total > 0 ? (
                  <span style={{ color: "#555", whiteSpace: "nowrap" }}>
                    {copy.current}/{copy.total}
                  </span>
                ) : null}
              </div>
              {copy.total > 0 ? (
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
                      width: `${Math.round((copy.current / copy.total) * 100)}%`,
                      background: copy.phase === "error" ? "#b71c1c" : "#111",
                      borderRadius: 999,
                    }}
                  />
                </div>
              ) : null}
              {copy.detail ? (
                <p style={{ ...hint, marginTop: 8 }}>{copy.detail}</p>
              ) : null}
            </div>
          ) : null}
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

      <LiveCameraSheet
        open={cameraOpen}
        shotCount={photos.length}
        maxShots={MAX_PROCESS_PHOTOS}
        latestPreviewUrl={photos[photos.length - 1]?.url ?? null}
        onCapture={(file) => addFileList([file])}
        onClose={() => setCameraOpen(false)}
        onUnavailable={(message) => {
          setCameraOpen(false);
          props.onError(message);
          cameraRef.current?.click();
        }}
      />

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
