import { createLocationsAdminClient } from "./admin";
import {
  CAPTURE_FAILED_RETAIN_DAYS,
  CAPTURE_SUCCESS_RETAIN_DAYS,
  LOCATIONS_CAPTURE_BUCKET,
  LOCATIONS_TABLES,
  MAX_ASSETS_PER_CAPTURE_SET,
} from "./tables";
import { LocationsStoreError, getPlace } from "./store";
import {
  draftTextFromExtraction,
  extractZoneImages,
  normalizeExtractedZonePayload,
  type ExtractedZonePayload,
} from "@/lib/vision/extract-zone-images";

function client() {
  const supabase = createLocationsAdminClient();
  if (!supabase) {
    throw new LocationsStoreError(
      "Supabase not configured",
      "SUPABASE_NOT_CONFIGURED"
    );
  }
  return supabase;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export type CaptureSetStatus =
  | "open"
  | "ready"
  | "processing"
  | "draft_ready"
  | "failed"
  | "discarded";

export type CaptureSetRow = {
  id: string;
  team_id: string;
  place_id: string;
  zone_type: string;
  zone_label: string;
  status: CaptureSetStatus;
  pose_summary: string | null;
  asset_count: number;
  draft_text: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CaptureAssetRow = {
  id: string;
  set_id: string;
  storage_path: string;
  sort_order: number;
  byte_size: number | null;
  content_type: string;
  extract_status: string;
  extract_error: string | null;
};

export type ExtractJobRow = {
  id: string;
  set_id: string;
  place_id: string;
  status: string;
  images_total: number;
  images_done: number;
  failure_reason: string | null;
  draft_text: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapSet(row: Record<string, unknown>): CaptureSetRow {
  return {
    id: String(row.id),
    team_id: String(row.team_id),
    place_id: String(row.place_id),
    zone_type: String(row.zone_type || "aisle"),
    zone_label: String(row.zone_label || ""),
    status: (row.status as CaptureSetStatus) || "open",
    pose_summary: asString(row.pose_summary),
    asset_count: Number(row.asset_count) || 0,
    draft_text: asString(row.draft_text),
    closed_at: asString(row.closed_at),
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

function mapJob(row: Record<string, unknown>): ExtractJobRow {
  return {
    id: String(row.id),
    set_id: String(row.set_id),
    place_id: String(row.place_id),
    status: String(row.status || "queued"),
    images_total: Number(row.images_total) || 0,
    images_done: Number(row.images_done) || 0,
    failure_reason: asString(row.failure_reason),
    draft_text: asString(row.draft_text),
    started_at: asString(row.started_at),
    finished_at: asString(row.finished_at),
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

export async function listCaptureSets(place_id: string): Promise<CaptureSetRow[]> {
  const supabase = client();
  const { data, error } = await supabase
    .from(LOCATIONS_TABLES.captureSets)
    .select(
      "id, team_id, place_id, zone_type, zone_label, status, pose_summary, asset_count, draft_text, closed_at, created_at, updated_at"
    )
    .eq("place_id", place_id)
    .neq("status", "discarded")
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) {
    throw new LocationsStoreError(error.message, "CAPTURE_LIST_FAILED");
  }
  return (data || []).map((r) => mapSet(r as Record<string, unknown>));
}

export async function getCaptureSet(set_id: string): Promise<CaptureSetRow> {
  const supabase = client();
  const { data, error } = await supabase
    .from(LOCATIONS_TABLES.captureSets)
    .select(
      "id, team_id, place_id, zone_type, zone_label, status, pose_summary, asset_count, draft_text, closed_at, created_at, updated_at"
    )
    .eq("id", set_id)
    .single();
  if (error || !data) {
    throw new LocationsStoreError(
      error?.message || "Capture set not found",
      "CAPTURE_SET_NOT_FOUND"
    );
  }
  return mapSet(data as Record<string, unknown>);
}

export async function createCaptureSet(input: {
  place_id: string;
  zone_type: string;
  zone_label: string;
  pose_summary?: string | null;
}): Promise<CaptureSetRow> {
  const place = await getPlace(input.place_id);
  const zone_label = input.zone_label.trim();
  if (!zone_label) {
    throw new LocationsStoreError("zone_label required", "INVALID_REQUEST");
  }
  const supabase = client();
  const { data, error } = await supabase
    .from(LOCATIONS_TABLES.captureSets)
    .insert({
      team_id: place.team_id,
      place_id: place.id,
      zone_type: (input.zone_type || "aisle").trim() || "aisle",
      zone_label,
      status: "open",
      pose_summary: input.pose_summary?.trim() || null,
      asset_count: 0,
    })
    .select(
      "id, team_id, place_id, zone_type, zone_label, status, pose_summary, asset_count, draft_text, closed_at, created_at, updated_at"
    )
    .single();
  if (error || !data) {
    throw new LocationsStoreError(
      error?.message || "Failed to create capture set",
      "CAPTURE_CREATE_FAILED"
    );
  }
  return mapSet(data as Record<string, unknown>);
}

export async function closeCaptureSet(set_id: string): Promise<CaptureSetRow> {
  const set = await getCaptureSet(set_id);
  if (set.status !== "open") {
    return set;
  }
  if (set.asset_count < 1) {
    throw new LocationsStoreError(
      "Add at least one photo before closing the set",
      "CAPTURE_EMPTY"
    );
  }
  const supabase = client();
  const { data, error } = await supabase
    .from(LOCATIONS_TABLES.captureSets)
    .update({
      status: "ready",
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", set_id)
    .select(
      "id, team_id, place_id, zone_type, zone_label, status, pose_summary, asset_count, draft_text, closed_at, created_at, updated_at"
    )
    .single();
  if (error || !data) {
    throw new LocationsStoreError(
      error?.message || "Failed to close set",
      "CAPTURE_CLOSE_FAILED"
    );
  }
  return mapSet(data as Record<string, unknown>);
}

export async function listCaptureAssets(
  set_id: string
): Promise<CaptureAssetRow[]> {
  const supabase = client();
  const { data, error } = await supabase
    .from(LOCATIONS_TABLES.captureAssets)
    .select(
      "id, set_id, storage_path, sort_order, byte_size, content_type, extract_status, extract_error"
    )
    .eq("set_id", set_id)
    .order("sort_order", { ascending: true });
  if (error) {
    throw new LocationsStoreError(error.message, "CAPTURE_ASSETS_FAILED");
  }
  return (data || []).map((r) => ({
    id: String(r.id),
    set_id: String(r.set_id),
    storage_path: String(r.storage_path),
    sort_order: Number(r.sort_order) || 0,
    byte_size: r.byte_size == null ? null : Number(r.byte_size),
    content_type: String(r.content_type || "image/jpeg"),
    extract_status: String(r.extract_status || "pending"),
    extract_error: asString(r.extract_error),
  }));
}

/**
 * Create asset row + signed upload URL. Client PUTs bytes, then calls confirm.
 */
export async function beginCaptureAssetUpload(input: {
  set_id: string;
  content_type?: string;
  byte_size?: number | null;
}): Promise<{
  asset: CaptureAssetRow;
  upload_url: string;
  token: string;
  path: string;
}> {
  const set = await getCaptureSet(input.set_id);
  if (set.status === "discarded" || set.status === "processing") {
    throw new LocationsStoreError(
      set.status === "processing"
        ? "Set is processing — try again when finished"
        : "Capture set was discarded",
      "CAPTURE_SET_CLOSED"
    );
  }
  if (set.asset_count >= MAX_ASSETS_PER_CAPTURE_SET) {
    throw new LocationsStoreError(
      `Max ${MAX_ASSETS_PER_CAPTURE_SET} photos per set`,
      "CAPTURE_SET_FULL"
    );
  }

  const content_type = input.content_type?.trim() || "image/jpeg";
  if (!content_type.startsWith("image/")) {
    throw new LocationsStoreError("Only images allowed", "INVALID_REQUEST");
  }

  const supabase = client();
  const assetId = crypto.randomUUID();
  const ext = content_type.includes("png")
    ? "png"
    : content_type.includes("webp")
      ? "webp"
      : "jpg";
  const storage_path = `${set.team_id}/${set.place_id}/${set.id}/${assetId}.${ext}`;
  const sort_order = set.asset_count;

  const { data: asset, error } = await supabase
    .from(LOCATIONS_TABLES.captureAssets)
    .insert({
      id: assetId,
      team_id: set.team_id,
      place_id: set.place_id,
      set_id: set.id,
      storage_path,
      sort_order,
      byte_size: input.byte_size ?? null,
      content_type,
      extract_status: "pending",
    })
    .select(
      "id, set_id, storage_path, sort_order, byte_size, content_type, extract_status, extract_error"
    )
    .single();

  if (error || !asset) {
    throw new LocationsStoreError(
      error?.message || "Failed to create asset",
      "CAPTURE_ASSET_FAILED"
    );
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(LOCATIONS_CAPTURE_BUCKET)
    .createSignedUploadUrl(storage_path);

  if (signError || !signed) {
    await supabase.from(LOCATIONS_TABLES.captureAssets).delete().eq("id", assetId);
    throw new LocationsStoreError(
      signError?.message || "Failed to sign upload URL",
      "CAPTURE_SIGN_FAILED"
    );
  }

  await supabase
    .from(LOCATIONS_TABLES.captureSets)
    .update({
      asset_count: set.asset_count + 1,
      // Album model: keep sets editable after load/save (no forced close).
      status: "open",
      updated_at: new Date().toISOString(),
    })
    .eq("id", set.id);

  return {
    asset: {
      id: String(asset.id),
      set_id: String(asset.set_id),
      storage_path: String(asset.storage_path),
      sort_order: Number(asset.sort_order) || 0,
      byte_size: asset.byte_size == null ? null : Number(asset.byte_size),
      content_type: String(asset.content_type || "image/jpeg"),
      extract_status: String(asset.extract_status || "pending"),
      extract_error: asString(asset.extract_error),
    },
    upload_url: signed.signedUrl,
    token: signed.token,
    path: signed.path || storage_path,
  };
}

/** Signed download URLs so the mapper can load a set into the live photo grid. */
export async function listCaptureAssetsWithUrls(
  set_id: string,
  expiresSec = 3600
): Promise<Array<CaptureAssetRow & { download_url: string }>> {
  const assets = await listCaptureAssets(set_id);
  const supabase = client();
  const out: Array<CaptureAssetRow & { download_url: string }> = [];
  for (const asset of assets) {
    const { data, error } = await supabase.storage
      .from(LOCATIONS_CAPTURE_BUCKET)
      .createSignedUrl(asset.storage_path, expiresSec);
    if (error || !data?.signedUrl) {
      throw new LocationsStoreError(
        error?.message || "Failed to sign download URL",
        "CAPTURE_SIGN_FAILED"
      );
    }
    out.push({ ...asset, download_url: data.signedUrl });
  }
  return out;
}

export async function deleteCaptureAsset(asset_id: string): Promise<void> {
  const supabase = client();
  const { data: row, error } = await supabase
    .from(LOCATIONS_TABLES.captureAssets)
    .select("id, set_id, storage_path")
    .eq("id", asset_id)
    .maybeSingle();
  if (error) {
    throw new LocationsStoreError(error.message, "CAPTURE_ASSET_GET_FAILED");
  }
  if (!row) {
    throw new LocationsStoreError("Asset not found", "CAPTURE_ASSET_NOT_FOUND");
  }

  await supabase.storage
    .from(LOCATIONS_CAPTURE_BUCKET)
    .remove([String(row.storage_path)]);

  const { error: delError } = await supabase
    .from(LOCATIONS_TABLES.captureAssets)
    .delete()
    .eq("id", asset_id);
  if (delError) {
    throw new LocationsStoreError(delError.message, "CAPTURE_ASSET_DELETE_FAILED");
  }

  const set = await getCaptureSet(String(row.set_id));
  await supabase
    .from(LOCATIONS_TABLES.captureSets)
    .update({
      asset_count: Math.max(0, set.asset_count - 1),
      status: "open",
      updated_at: new Date().toISOString(),
    })
    .eq("id", set.id);
}

/** Rename a photo set (stored as zone_label; zone_type stays album/aisle). */
export async function renameCaptureSet(input: {
  set_id: string;
  name: string;
}): Promise<CaptureSetRow> {
  const name = input.name.trim();
  if (!name) {
    throw new LocationsStoreError("name required", "INVALID_REQUEST");
  }
  const supabase = client();
  const { data, error } = await supabase
    .from(LOCATIONS_TABLES.captureSets)
    .update({
      zone_label: name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.set_id)
    .select(
      "id, team_id, place_id, zone_type, zone_label, status, pose_summary, asset_count, draft_text, closed_at, created_at, updated_at"
    )
    .single();
  if (error || !data) {
    throw new LocationsStoreError(
      error?.message || "Failed to rename set",
      "CAPTURE_RENAME_FAILED"
    );
  }
  return mapSet(data as Record<string, unknown>);
}

export async function discardCaptureSet(set_id: string): Promise<void> {
  const set = await getCaptureSet(set_id);
  const assets = await listCaptureAssets(set_id);
  const supabase = client();
  if (assets.length > 0) {
    await supabase.storage
      .from(LOCATIONS_CAPTURE_BUCKET)
      .remove(assets.map((a) => a.storage_path));
  }
  await supabase
    .from(LOCATIONS_TABLES.captureAssets)
    .delete()
    .eq("set_id", set_id);
  await supabase
    .from(LOCATIONS_TABLES.captureSets)
    .update({
      status: "discarded",
      asset_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", set.id);
}

export async function confirmCaptureAssetUpload(input: {
  asset_id: string;
  byte_size?: number | null;
}): Promise<CaptureAssetRow> {
  const supabase = client();
  const { data, error } = await supabase
    .from(LOCATIONS_TABLES.captureAssets)
    .update({
      byte_size: input.byte_size ?? undefined,
      updated_at: new Date().toISOString(),
      metadata: { uploaded: true, confirmed_at: new Date().toISOString() },
    })
    .eq("id", input.asset_id)
    .select(
      "id, set_id, storage_path, sort_order, byte_size, content_type, extract_status, extract_error"
    )
    .single();
  if (error || !data) {
    throw new LocationsStoreError(
      error?.message || "Asset confirm failed",
      "CAPTURE_CONFIRM_FAILED"
    );
  }
  return {
    id: String(data.id),
    set_id: String(data.set_id),
    storage_path: String(data.storage_path),
    sort_order: Number(data.sort_order) || 0,
    byte_size: data.byte_size == null ? null : Number(data.byte_size),
    content_type: String(data.content_type || "image/jpeg"),
    extract_status: String(data.extract_status || "pending"),
    extract_error: asString(data.extract_error),
  };
}

export async function enqueueExtractJob(set_id: string): Promise<ExtractJobRow> {
  const set = await getCaptureSet(set_id);
  if (set.status !== "ready" && set.status !== "failed" && set.status !== "draft_ready") {
    if (set.status === "open") {
      throw new LocationsStoreError(
        "Close the set before queueing extract",
        "CAPTURE_SET_OPEN"
      );
    }
    if (set.status === "processing") {
      throw new LocationsStoreError(
        "Extract already in progress for this set",
        "EXTRACT_IN_PROGRESS"
      );
    }
  }
  const assets = await listCaptureAssets(set_id);
  if (assets.length === 0) {
    throw new LocationsStoreError("No photos in set", "CAPTURE_EMPTY");
  }

  const supabase = client();

  // Reset asset extract state for re-runs
  await supabase
    .from(LOCATIONS_TABLES.captureAssets)
    .update({
      extract_status: "pending",
      extract_error: null,
      extract_payload: null,
      updated_at: new Date().toISOString(),
    })
    .eq("set_id", set_id);

  const { data: job, error } = await supabase
    .from(LOCATIONS_TABLES.extractJobs)
    .insert({
      team_id: set.team_id,
      place_id: set.place_id,
      set_id: set.id,
      status: "queued",
      images_total: assets.length,
      images_done: 0,
      draft_text: null,
      result_json: null,
      failure_reason: null,
    })
    .select(
      "id, set_id, place_id, status, images_total, images_done, failure_reason, draft_text, started_at, finished_at, created_at, updated_at"
    )
    .single();

  if (error || !job) {
    throw new LocationsStoreError(
      error?.message || "Failed to enqueue job",
      "EXTRACT_ENQUEUE_FAILED"
    );
  }

  await supabase
    .from(LOCATIONS_TABLES.captureSets)
    .update({
      status: "processing",
      draft_text: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", set_id);

  return mapJob(job as Record<string, unknown>);
}

export async function getExtractJob(job_id: string): Promise<ExtractJobRow> {
  const supabase = client();
  const { data, error } = await supabase
    .from(LOCATIONS_TABLES.extractJobs)
    .select(
      "id, set_id, place_id, status, images_total, images_done, failure_reason, draft_text, started_at, finished_at, created_at, updated_at"
    )
    .eq("id", job_id)
    .single();
  if (error || !data) {
    throw new LocationsStoreError(
      error?.message || "Job not found",
      "EXTRACT_JOB_NOT_FOUND"
    );
  }
  return mapJob(data as Record<string, unknown>);
}

export async function listExtractJobsForPlace(
  place_id: string
): Promise<ExtractJobRow[]> {
  const supabase = client();
  const { data, error } = await supabase
    .from(LOCATIONS_TABLES.extractJobs)
    .select(
      "id, set_id, place_id, status, images_total, images_done, failure_reason, draft_text, started_at, finished_at, created_at, updated_at"
    )
    .eq("place_id", place_id)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    throw new LocationsStoreError(error.message, "EXTRACT_LIST_FAILED");
  }
  return (data || []).map((r) => mapJob(r as Record<string, unknown>));
}

async function downloadAssetDataUrl(storage_path: string): Promise<string> {
  const supabase = client();
  const { data, error } = await supabase.storage
    .from(LOCATIONS_CAPTURE_BUCKET)
    .download(storage_path);
  if (error || !data) {
    throw new LocationsStoreError(
      error?.message || "Failed to download capture asset",
      "CAPTURE_DOWNLOAD_FAILED"
    );
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  const mime = data.type || "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

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

/** A killed invocation can leave a photo stuck on "running". */
const STALE_RUNNING_MS = 90_000;

async function releaseStaleRunningExtracts() {
  const supabase = client();
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  await supabase
    .from(LOCATIONS_TABLES.captureAssets)
    .update({
      extract_status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("extract_status", "running")
    .lt("updated_at", cutoff);
}

/**
 * Process at most one pending asset for any running/queued job.
 * Designed for short serverless invocations (cron tick).
 */
export async function tickExtractQueue(): Promise<{
  processed: boolean;
  job_id?: string;
  asset_id?: string;
  status?: string;
  message: string;
}> {
  const supabase = client();

  // Prefer continuing a running job
  let { data: job } = await supabase
    .from(LOCATIONS_TABLES.extractJobs)
    .select(
      "id, team_id, place_id, set_id, status, images_total, images_done, failure_reason, draft_text, started_at, finished_at, created_at, updated_at"
    )
    .eq("status", "running")
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!job) {
    const queued = await supabase
      .from(LOCATIONS_TABLES.extractJobs)
      .select(
        "id, team_id, place_id, set_id, status, images_total, images_done, failure_reason, draft_text, started_at, finished_at, created_at, updated_at"
      )
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    job = queued.data;
    if (job) {
      await supabase
        .from(LOCATIONS_TABLES.extractJobs)
        .update({
          status: "running",
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      job = { ...job, status: "running" };
    }
  }

  if (!job) {
    return { processed: false, message: "No queued or running extract jobs" };
  }

  const jobId = String(job.id);
  const setId = String(job.set_id);

  const { data: asset } = await supabase
    .from(LOCATIONS_TABLES.captureAssets)
    .select(
      "id, set_id, storage_path, sort_order, content_type, extract_status"
    )
    .eq("set_id", setId)
    .eq("extract_status", "pending")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!asset) {
    // Finalize job from completed assets
    return finalizeExtractJob(jobId, setId);
  }

  const assetId = String(asset.id);
  await supabase
    .from(LOCATIONS_TABLES.captureAssets)
    .update({
      extract_status: "running",
      updated_at: new Date().toISOString(),
    })
    .eq("id", assetId);

  const set = await getCaptureSet(setId);
  const place = await getPlace(set.place_id);

  try {
    const image_url = await downloadAssetDataUrl(String(asset.storage_path));
    const result = await extractZoneImages({
      placeName: place.name,
      zoneType: set.zone_type,
      zoneLabel: set.zone_label,
      extractionMode: "product",
      images: [
        {
          image_url,
          source_hint: `asset-${asset.sort_order + 1}`,
        },
      ],
    });

    await supabase
      .from(LOCATIONS_TABLES.captureAssets)
      .update({
        extract_status: "done",
        extract_error: null,
        extract_payload: {
          draftText: result.draftText,
          merged: result.merged,
          failures: result.extraction_failures,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", assetId);

    const images_done = Number(job.images_done || 0) + 1;
    await supabase
      .from(LOCATIONS_TABLES.extractJobs)
      .update({
        images_done,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // If this was the last image, finalize now
    if (images_done >= Number(job.images_total || 0)) {
      return finalizeExtractJob(jobId, setId);
    }

    return {
      processed: true,
      job_id: jobId,
      asset_id: assetId,
      status: "running",
      message: `Extracted asset ${images_done}/${job.images_total}`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Extract failed";
    await supabase
      .from(LOCATIONS_TABLES.captureAssets)
      .update({
        extract_status: "failed",
        extract_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", assetId);

    const images_done = Number(job.images_done || 0) + 1;
    await supabase
      .from(LOCATIONS_TABLES.extractJobs)
      .update({
        images_done,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (images_done >= Number(job.images_total || 0)) {
      return finalizeExtractJob(jobId, setId);
    }

    return {
      processed: true,
      job_id: jobId,
      asset_id: assetId,
      status: "running",
      message: `Asset failed (${message}); continuing`,
    };
  }
}

/**
 * Extract as many pending photos as fit in one Vercel run.
 * `more` means the queue is still running and another run should start.
 */
export async function runExtractBudget(budgetMs = 45_000): Promise<{
  processed: boolean;
  more: boolean;
  steps: number;
  job_id?: string;
  asset_id?: string;
  status?: string;
  message: string;
}> {
  await releaseStaleRunningExtracts();
  const deadline = Date.now() + budgetMs;
  let last = await tickExtractQueue();
  let steps = last.processed ? 1 : 0;
  while (
    last.processed &&
    last.status === "running" &&
    Date.now() < deadline
  ) {
    last = await tickExtractQueue();
    if (last.processed) steps += 1;
  }
  return {
    ...last,
    steps,
    more: Boolean(last.processed && last.status === "running"),
  };
}

async function finalizeExtractJob(
  jobId: string,
  setId: string
): Promise<{
  processed: boolean;
  job_id?: string;
  status?: string;
  message: string;
}> {
  const supabase = client();
  const set = await getCaptureSet(setId);
  const { data: assets } = await supabase
    .from(LOCATIONS_TABLES.captureAssets)
    .select("extract_status, extract_payload, extract_error, sort_order")
    .eq("set_id", setId)
    .order("sort_order", { ascending: true });

  const rows = assets || [];
  const drafts: string[] = [];
  const payloads: ExtractedZonePayload[] = [];
  let failures = 0;

  for (const row of rows) {
    if (row.extract_status === "failed") {
      failures += 1;
      continue;
    }
    const payload = row.extract_payload as {
      draftText?: string;
      merged?: unknown;
    } | null;
    if (payload?.draftText) drafts.push(payload.draftText);
    if (payload?.merged) {
      payloads.push(
        normalizeExtractedZonePayload(
          payload.merged,
          `${set.zone_type} ${set.zone_label}`.trim()
        )
      );
    }
  }

  let draft_text = mergeDraftTexts(drafts);
  if (!draft_text && payloads.length > 0) {
    const mergedItems = payloads.flatMap((p) => p.observed_items);
    draft_text = draftTextFromExtraction({
      zoneType: set.zone_type,
      zoneLabel: set.zone_label,
      payload: {
        zone_summary: `${set.zone_type} ${set.zone_label}`.trim(),
        visible_sections: [],
        nearby_landmarks: [],
        observed_categories: [],
        observed_items: mergedItems,
        notes: [],
      },
    });
  }

  const allFailed = drafts.length === 0;
  const retainDays = allFailed
    ? CAPTURE_FAILED_RETAIN_DAYS
    : CAPTURE_SUCCESS_RETAIN_DAYS;
  const retain_until = new Date(
    Date.now() + retainDays * 24 * 60 * 60 * 1000
  ).toISOString();

  if (allFailed) {
    await supabase
      .from(LOCATIONS_TABLES.extractJobs)
      .update({
        status: "failed",
        failure_reason: "All images failed extraction",
        finished_at: new Date().toISOString(),
        retain_until,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    await supabase
      .from(LOCATIONS_TABLES.captureSets)
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", setId);
    return {
      processed: true,
      job_id: jobId,
      status: "failed",
      message: "Job failed — all images failed",
    };
  }

  await supabase
    .from(LOCATIONS_TABLES.extractJobs)
    .update({
      status: "draft_ready",
      draft_text,
      result_json: {
        drafts,
        failures,
        asset_count: rows.length,
      },
      failure_reason:
        failures > 0 ? `${failures} image(s) failed` : null,
      finished_at: new Date().toISOString(),
      retain_until,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  await supabase
    .from(LOCATIONS_TABLES.captureSets)
    .update({
      status: "draft_ready",
      draft_text,
      updated_at: new Date().toISOString(),
    })
    .eq("id", setId);

  return {
    processed: true,
    job_id: jobId,
    status: "draft_ready",
    message: `Draft ready (${drafts.length} image(s))${
      failures ? `; ${failures} failed` : ""
    }`,
  };
}

/** Delete storage objects past retain_until and mark sets discarded when empty. */
export async function cleanupExpiredCaptureAssets(): Promise<{
  deleted: number;
}> {
  const supabase = client();
  const now = new Date().toISOString();
  const { data: jobs } = await supabase
    .from(LOCATIONS_TABLES.extractJobs)
    .select("id, set_id, retain_until")
    .not("retain_until", "is", null)
    .lte("retain_until", now)
    .limit(20);

  let deleted = 0;
  for (const job of jobs || []) {
    const setId = String(job.set_id);
    const assets = await listCaptureAssets(setId);
    for (const asset of assets) {
      const { error } = await supabase.storage
        .from(LOCATIONS_CAPTURE_BUCKET)
        .remove([asset.storage_path]);
      if (!error) deleted += 1;
    }
    await supabase
      .from(LOCATIONS_TABLES.captureAssets)
      .delete()
      .eq("set_id", setId);
    await supabase
      .from(LOCATIONS_TABLES.extractJobs)
      .update({
        retain_until: null,
        metadata: { cleaned_at: now },
        updated_at: now,
      })
      .eq("id", job.id);
  }
  return { deleted };
}
