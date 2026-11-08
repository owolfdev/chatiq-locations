import { getPlace } from "@/lib/supabase/store";
import {
  MAX_PHOTO_BYTES,
  MAX_PROCESS_PHOTOS,
} from "@/lib/vision/constants";
import { extractZoneImages, fileToDataUrl } from "@/lib/vision/extract-zone-images";

export type ProcessPhotosResult =
  | {
      ok: true;
      draftText: string;
      item_count: number;
      failures: Array<{ image_index: number; error: string }>;
    }
  | { ok: false; error: string };

export { MAX_PHOTO_BYTES, MAX_PROCESS_PHOTOS };

/**
 * Vision extract → editable draft for Text/speak. Does not publish.
 * Photos are ephemeral (never stored).
 */
export async function processMapperPhotosCore(
  formData: FormData
): Promise<ProcessPhotosResult> {
  try {
    const place_id = String(formData.get("place_id") || "").trim();
    if (!place_id) return { ok: false, error: "place_id required" };

    const sticky_zone_type =
      String(formData.get("sticky_zone_type") || "aisle").trim() || "aisle";
    const sticky_zone_label = String(
      formData.get("sticky_zone_label") || ""
    ).trim();
    if (!sticky_zone_label) {
      return {
        ok: false,
        error: "Set sticky zone label (e.g. aisle 9) before processing photos",
      };
    }

    const place = await getPlace(place_id);
    const files = formData
      .getAll("photos")
      .filter((v): v is File => v instanceof File && v.size > 0)
      .slice(0, MAX_PROCESS_PHOTOS);

    if (files.length === 0) {
      return { ok: false, error: "No photos uploaded" };
    }

    for (const file of files) {
      if (file.size > MAX_PHOTO_BYTES) {
        return {
          ok: false,
          error: `Photo “${file.name || "image"}” is still too large after compress (max 2.5MB). Try fewer or smaller shots.`,
        };
      }
      if (file.type && !file.type.startsWith("image/")) {
        return {
          ok: false,
          error: `“${file.name || "file"}” is not an image`,
        };
      }
    }

    const images = await Promise.all(
      files.map(async (file, i) => ({
        image_url: await fileToDataUrl(file),
        source_hint: file.name || `photo-${i + 1}`,
      }))
    );

    const result = await extractZoneImages({
      placeName: place.name,
      zoneType: sticky_zone_type,
      zoneLabel: sticky_zone_label,
      extractionMode: "product",
      images,
    });

    return {
      ok: true,
      draftText: result.draftText,
      item_count: result.merged.observed_items.length,
      failures: result.extraction_failures.map((f) => ({
        image_index: f.image_index,
        error: f.error,
      })),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Vision extract failed",
    };
  }
}
