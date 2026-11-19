import { randomUUID } from "crypto";

import { createLocationsAdminClient } from "@/lib/supabase/admin";
import { LOCATIONS_PROMOTIONS_BUCKET } from "@/lib/supabase/tables";

const MAX_BYTES = 5 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function storePromotionImage(input: {
  placeId: string;
  bytes: Buffer;
  mime: string;
}): Promise<{ imagePath: string; imageUrl: string }> {
  const ext = MIME_EXT[input.mime];
  if (!ext) {
    throw new Error("Use a JPEG, PNG, or WebP image");
  }
  if (input.bytes.length === 0 || input.bytes.length > MAX_BYTES) {
    throw new Error("Image must be under 5 MB");
  }
  const supabase = createLocationsAdminClient();
  if (!supabase) throw new Error("Supabase not configured");

  const imagePath = `places/${input.placeId}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(LOCATIONS_PROMOTIONS_BUCKET)
    .upload(imagePath, input.bytes, {
      contentType: input.mime,
      upsert: false,
    });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage
    .from(LOCATIONS_PROMOTIONS_BUCKET)
    .getPublicUrl(imagePath);
  const imageUrl = data?.publicUrl;
  if (!imageUrl) throw new Error("Could not make a public image address");
  return { imagePath, imageUrl };
}

export async function generatePromotionImageBytes(
  prompt: string
): Promise<{ bytes: Buffer; mime: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Image generation is not configured");
  const text = prompt.trim();
  if (!text) throw new Error("Enter a prompt");

  const generated = await requestImage(apiKey, text, "gpt-image-1");
  if (generated) return generated;
  const fallback = await requestImage(apiKey, text, "dall-e-3");
  if (fallback) return fallback;
  throw new Error("Image generation failed");
}

async function requestImage(
  apiKey: string,
  prompt: string,
  model: string
): Promise<{ bytes: Buffer; mime: string } | null> {
  const body: Record<string, unknown> = {
    model,
    prompt,
    size: "1024x1024",
  };
  if (model === "gpt-image-1") body.quality = "medium";
  if (model === "dall-e-3") body.response_format = "b64_json";

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.warn("[promotions] image generation failed", model, response.status, detail.slice(0, 180));
    return null;
  }
  const payload = (await response.json()) as {
    data?: Array<{ b64_json?: string }>;
  };
  const b64 = payload.data?.[0]?.b64_json;
  if (!b64) return null;
  return { bytes: Buffer.from(b64, "base64"), mime: "image/png" };
}
