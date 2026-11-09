"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { compressImageForUpload } from "@/lib/vision/compress-image-client";
import { MAX_ASSETS_PER_CAPTURE_SET } from "@/lib/supabase/tables";
import {
  hasMapperToken,
  mapperAuthHeaders,
  readMapperToken,
} from "@/lib/survey/mapper-token-client";

type CaptureSet = {
  id: string;
  zone_type: string;
  zone_label: string;
  status: string;
  asset_count: number;
  draft_text: string | null;
  created_at: string;
};

type ExtractJob = {
  id: string;
  set_id: string;
  status: string;
  images_total: number;
  images_done: number;
  failure_reason: string | null;
  draft_text: string | null;
};

type Props = {
  placeId: string;
  stickyType: string;
  stickyLabel: string;
  stickyReady: boolean;
  onUseDraft: (draftText: string) => void;
};

export function SurveyPanel(props: Props) {
  const [sets, setSets] = useState<CaptureSet[]>([]);
  const [jobs, setJobs] = useState<ExtractJob[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const activeSet = sets.find((s) => s.id === activeSetId) || null;

  const refresh = useCallback(async () => {
    if (!hasMapperToken()) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    const headers = mapperAuthHeaders();
    const [setsRes, jobsRes] = await Promise.all([
      fetch(`/api/survey/sets?place_id=${encodeURIComponent(props.placeId)}`, {
        headers,
      }),
      fetch(`/api/survey/jobs?place_id=${encodeURIComponent(props.placeId)}`, {
        headers,
      }),
    ]);
    const setsJson = (await setsRes.json()) as {
      ok: boolean;
      sets?: CaptureSet[];
      error?: string;
    };
    const jobsJson = (await jobsRes.json()) as {
      ok: boolean;
      jobs?: ExtractJob[];
      error?: string;
    };
    if (!setsJson.ok) {
      setError(setsJson.error || "Failed to load sets");
      return;
    }
    setSets(setsJson.sets || []);
    if (jobsJson.ok) setJobs(jobsJson.jobs || []);
    setError(null);
  }, [props.placeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // While jobs run: kick worker tick + refresh (desktop tab can drain queue;
  // Vercel cron also ticks every minute if configured).
  useEffect(() => {
    const active = jobs.some(
      (j) => j.status === "queued" || j.status === "running"
    );
    if (!active) return;
    const id = window.setInterval(() => {
      void (async () => {
        await fetch("/api/cron/extract-tick", {
          method: "POST",
          headers: mapperAuthHeaders(),
        });
        await refresh();
      })();
    }, 4000);
    return () => window.clearInterval(id);
  }, [jobs, refresh]);

  async function createSet() {
    if (!props.stickyReady) {
      setError("Set sticky zone first (e.g. aisle 9)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/survey/sets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...mapperAuthHeaders(),
        },
        body: JSON.stringify({
          place_id: props.placeId,
          zone_type: props.stickyType,
          zone_label: props.stickyLabel.trim(),
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        set?: CaptureSet;
        error?: string;
      };
      if (!json.ok || !json.set) {
        setError(json.error || "Create set failed");
        return;
      }
      setActiveSetId(json.set.id);
      setStatus(
        `Open set · ${json.set.zone_type} ${json.set.zone_label} — shoot to upload`
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    if (!activeSetId || activeSet?.status !== "open") {
      setError("Start / open a capture set first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const list = Array.from(files).slice(0, MAX_ASSETS_PER_CAPTURE_SET);
      for (let i = 0; i < list.length; i++) {
        setStatus(`Uploading photo ${i + 1} of ${list.length}…`);
        const compressed = await compressImageForUpload(list[i]);
        const beginRes = await fetch(
          `/api/survey/sets/${activeSetId}/assets`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...mapperAuthHeaders(),
            },
            body: JSON.stringify({
              content_type: compressed.type || "image/jpeg",
              byte_size: compressed.size,
            }),
          }
        );
        const beginJson = (await beginRes.json()) as {
          ok: boolean;
          asset?: { id: string };
          upload_url?: string;
          token?: string;
          error?: string;
        };
        if (!beginJson.ok || !beginJson.upload_url || !beginJson.asset) {
          setError(beginJson.error || "Could not start upload");
          return;
        }

        const put = await fetch(beginJson.upload_url, {
          method: "PUT",
          headers: {
            "Content-Type": compressed.type || "image/jpeg",
          },
          body: compressed,
        });
        if (!put.ok) {
          setError(`Storage upload failed (${put.status})`);
          return;
        }

        await fetch(`/api/survey/assets/${beginJson.asset.id}/confirm`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...mapperAuthHeaders(),
          },
          body: JSON.stringify({ byte_size: compressed.size }),
        });
      }
      setStatus(`Uploaded ${list.length} photo(s) to set`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (libraryRef.current) libraryRef.current.value = "";
    }
  }

  async function closeSet() {
    if (!activeSetId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/survey/sets/${activeSetId}/close`, {
        method: "POST",
        headers: mapperAuthHeaders(),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error || "Close failed");
        return;
      }
      setStatus("Set closed · ready to queue extract");
      setActiveSetId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function queueExtract(setId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/survey/sets/${setId}/extract`, {
        method: "POST",
        headers: mapperAuthHeaders(),
      });
      const json = (await res.json()) as {
        ok: boolean;
        job?: ExtractJob;
        error?: string;
      };
      if (!json.ok) {
        setError(json.error || "Enqueue failed");
        return;
      }
      setStatus(
        `Extract queued · ${json.job?.images_total || "?"} photo(s). Worker runs in background.`
      );
      await refresh();
      // Kick a tick immediately so local/dev doesn't wait for cron
      void fetch("/api/cron/extract-tick", {
        method: "POST",
        headers: mapperAuthHeaders(),
      });
    } finally {
      setBusy(false);
    }
  }

  async function runTick() {
    setBusy(true);
    try {
      const res = await fetch("/api/cron/extract-tick", {
        method: "POST",
        headers: {
          ...mapperAuthHeaders(),
          Authorization: `Bearer ${readMapperToken()}`,
        },
      });
      const json = (await res.json()) as {
        ok: boolean;
        tick?: { message?: string };
        error?: string;
      };
      if (!json.ok) {
        setError(json.error || "Tick failed (set CRON_SECRET or mapper token)");
        return;
      }
      setStatus(json.tick?.message || "Worker tick ok");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!authed) {
    return (
      <section style={card}>
        <label style={label}>Survey sets (background extract)</label>
        <p style={hint}>
          Add <code>access_token</code> to the mapper URL (same value as{" "}
          <code>LOCATIONS_MAPPER_TOKEN</code> / service token) to capture aisle
          sets for later processing on any device.
        </p>
      </section>
    );
  }

  return (
    <section style={card}>
      <label style={label}>Survey sets</label>
      <p style={{ ...hint, marginTop: 0 }}>
        Walk aisle → upload shots into a set → close → queue extract later
        (desktop OK). Drafts never auto-publish.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={() => void createSet()}
          disabled={busy || !props.stickyReady}
          style={primaryBtn}
        >
          Start set for sticky zone
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          style={secondaryBtn}
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => void runTick()}
          disabled={busy}
          style={secondaryBtn}
        >
          Run worker tick
        </button>
      </div>

      {activeSet && activeSet.status === "open" ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: "0 0 8px", fontSize: 15 }}>
            Open: <strong>{activeSet.zone_type} {activeSet.zone_label}</strong> ·{" "}
            {activeSet.asset_count}/{MAX_ASSETS_PER_CAPTURE_SET} photos
          </p>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => void uploadFiles(e.target.files)}
            style={{ display: "none" }}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => void uploadFiles(e.target.files)}
            style={{ display: "none" }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
              style={primaryBtn}
            >
              Take & upload
            </button>
            <button
              type="button"
              onClick={() => libraryRef.current?.click()}
              disabled={busy}
              style={secondaryBtn}
            >
              Upload from library
            </button>
            <button
              type="button"
              onClick={() => void closeSet()}
              disabled={busy || activeSet.asset_count < 1}
              style={secondaryBtn}
            >
              Close set
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p style={{ color: "#b71c1c", margin: "10px 0 0", fontSize: 15 }}>
          {error}
        </p>
      ) : null}
      {status ? (
        <p style={{ color: "#1b5e20", margin: "10px 0 0", fontSize: 15 }}>
          {status}
        </p>
      ) : null}

      <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0" }}>
        {sets.length === 0 ? (
          <li style={{ ...hint, listStyle: "none" }}>No capture sets yet.</li>
        ) : (
          sets.map((s) => {
            const job = jobs.find((j) => j.set_id === s.id);
            return (
              <li
                key={s.id}
                style={{
                  borderTop: "1px solid #eee",
                  padding: "10px 0",
                  fontSize: 15,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong>
                      {s.zone_type} {s.zone_label}
                    </strong>
                    <div style={{ color: "#666" }}>
                      {s.asset_count} photo(s) · {s.status}
                      {job
                        ? ` · job ${job.status} ${job.images_done}/${job.images_total}`
                        : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {s.status === "open" ? (
                      <button
                        type="button"
                        style={linkBtn}
                        onClick={() => setActiveSetId(s.id)}
                      >
                        Resume
                      </button>
                    ) : null}
                    {s.status === "ready" ||
                    s.status === "failed" ||
                    s.status === "draft_ready" ? (
                      <button
                        type="button"
                        style={linkBtn}
                        disabled={busy}
                        onClick={() => void queueExtract(s.id)}
                      >
                        Queue extract
                      </button>
                    ) : null}
                    {(s.draft_text || job?.draft_text) &&
                    (s.status === "draft_ready" ||
                      job?.status === "draft_ready") ? (
                      <button
                        type="button"
                        style={linkBtn}
                        onClick={() =>
                          props.onUseDraft(
                            (job?.draft_text || s.draft_text || "").trim()
                          )
                        }
                      >
                        Use draft
                      </button>
                    ) : null}
                  </div>
                </div>
                {job && (job.status === "queued" || job.status === "running") ? (
                  <div style={{ marginTop: 8 }}>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 999,
                        background: "#e8e8e8",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${
                            job.images_total
                              ? Math.round(
                                  (job.images_done / job.images_total) * 100
                                )
                              : 0
                          }%`,
                          background: "#111",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                ) : null}
                {job?.failure_reason ? (
                  <div style={{ color: "#b71c1c", marginTop: 4 }}>
                    {job.failure_reason}
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
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
  padding: "8px 12px",
  borderRadius: 8,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 600,
};

const secondaryBtn: CSSProperties = {
  fontSize: 16,
  padding: "8px 12px",
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
