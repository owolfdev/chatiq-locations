"use server";

import { guardPlace } from "@/lib/auth/mapper-place-guard";
import {
  downloadStoredPromotionImage,
  generatePromotionImageBytes,
  storePromotionImage,
  type PromotionLogoFile,
} from "@/lib/promotions/images";
import {
  deletePromotion,
  getPlace,
  getPlaceLogo,
  listPromotionsForPlace,
  savePromotion,
  setPlaceLogo,
  type PlaceLogo,
  type PromotionRow,
} from "@/lib/supabase/store";

export type { PromotionRow };

const MIME_FROM_DATA_URL: Record<string, string> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
};

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

function decodeDataUrl(dataUrl: string): { bytes: Buffer; mime: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const mime = MIME_FROM_DATA_URL[match[1].toLowerCase()];
  if (!mime) return null;
  return { mime, bytes: Buffer.from(match[2].replace(/\s/g, ""), "base64") };
}

export async function loadPromotions(placeId: string): Promise<
  | { ok: true; promotions: PromotionRow[] }
  | { ok: false; error: string }
> {
  try {
    const denied = await guardPlace(placeId);
    if (denied) return { ok: false, error: denied };
    const promotions = await listPromotionsForPlace(placeId);
    return { ok: true, promotions };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not load promotions",
    };
  }
}

export async function savePlacePromotion(input: {
  place_id: string;
  id?: string | null;
  keywords: string;
  body?: string | null;
  image_path?: string | null;
  image_url?: string | null;
  image_prompt?: string | null;
  starts_at: string;
  ends_at: string;
  send_every_match?: boolean;
}): Promise<
  | { ok: true; promotion: PromotionRow; promotions: PromotionRow[] }
  | { ok: false; error: string }
> {
  try {
    const denied = await guardPlace(input.place_id);
    if (denied) return { ok: false, error: denied };
    const place = await getPlace(input.place_id);
    const promotion = await savePromotion({
      ...input,
      team_id: place.team_id,
    });
    const promotions = await listPromotionsForPlace(input.place_id);
    return { ok: true, promotion, promotions };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Save promotion failed",
    };
  }
}

export async function removePlacePromotion(input: {
  place_id: string;
  id: string;
}): Promise<
  | { ok: true; promotions: PromotionRow[] }
  | { ok: false; error: string }
> {
  try {
    const denied = await guardPlace(input.place_id);
    if (denied) return { ok: false, error: denied };
    await deletePromotion(input);
    const promotions = await listPromotionsForPlace(input.place_id);
    return { ok: true, promotions };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Delete promotion failed",
    };
  }
}

export async function generatePlacePromotionImage(input: {
  place_id: string;
  prompt: string;
}): Promise<
  | { ok: true; image_path: string; image_url: string }
  | { ok: false; error: string }
> {
  try {
    const denied = await guardPlace(input.place_id);
    if (denied) return { ok: false, error: denied };
    const logo = await getPlaceLogo(input.place_id);
    let logoFile: PromotionLogoFile | null = null;
    if (logo.image_path) {
      const logoBytes = await downloadStoredPromotionImage(logo.image_path);
      if (!logoBytes) throw new Error("Could not read the store logo");
      logoFile = {
        bytes: logoBytes,
        mime: mimeFromPath(logo.image_path),
        filename: logo.image_path.split("/").pop() || "logo.png",
      };
    }
    const generated = await generatePromotionImageBytes(input.prompt, logoFile);
    const stored = await storePromotionImage({
      placeId: input.place_id,
      bytes: generated.bytes,
      mime: generated.mime,
    });
    return {
      ok: true,
      image_path: stored.imagePath,
      image_url: stored.imageUrl,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Image generation failed",
    };
  }
}

export async function savePlaceLogoImage(input: {
  place_id: string;
  data_url: string;
}): Promise<{ ok: true; logo: PlaceLogo } | { ok: false; error: string }> {
  try {
    const denied = await guardPlace(input.place_id);
    if (denied) return { ok: false, error: denied };
    const decoded = decodeDataUrl(input.data_url);
    if (!decoded) return { ok: false, error: "Use a JPEG, PNG, or WebP image" };
    const stored = await storePromotionImage({
      placeId: input.place_id,
      bytes: decoded.bytes,
      mime: decoded.mime,
    });
    const logo = await setPlaceLogo({
      place_id: input.place_id,
      image_url: stored.imageUrl,
      image_path: stored.imagePath,
    });
    return { ok: true, logo };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not save the logo",
    };
  }
}

export async function clearPlaceLogoImage(input: {
  place_id: string;
}): Promise<{ ok: true; logo: PlaceLogo } | { ok: false; error: string }> {
  try {
    const denied = await guardPlace(input.place_id);
    if (denied) return { ok: false, error: denied };
    const logo = await setPlaceLogo({
      place_id: input.place_id,
      image_url: null,
      image_path: null,
    });
    return { ok: true, logo };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not remove the logo",
    };
  }
}

export async function uploadPlacePromotionImage(input: {
  place_id: string;
  data_url: string;
}): Promise<
  | { ok: true; image_path: string; image_url: string }
  | { ok: false; error: string }
> {
  try {
    const denied = await guardPlace(input.place_id);
    if (denied) return { ok: false, error: denied };
    const decoded = decodeDataUrl(input.data_url);
    if (!decoded) return { ok: false, error: "Use a JPEG, PNG, or WebP image" };
    const stored = await storePromotionImage({
      placeId: input.place_id,
      bytes: decoded.bytes,
      mime: decoded.mime,
    });
    return {
      ok: true,
      image_path: stored.imagePath,
      image_url: stored.imageUrl,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Upload failed",
    };
  }
}
