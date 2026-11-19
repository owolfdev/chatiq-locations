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

const IMAGE_MODELS = ["gpt-image-1.5", "chatgpt-image-latest"];

export async function generatePromotionImageBytes(
  prompt: string
): Promise<{ bytes: Buffer; mime: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Image generation is not configured");
  const text = prompt.trim();
  if (!text) throw new Error("Enter a prompt");

  let lastError = "Image generation failed";
  for (const model of IMAGE_MODELS) {
    const generated = await requestImage(apiKey, text, model);
    if ("bytes" in generated) return generated;
    lastError = generated.error;
  }
  throw new Error(lastError);
}

async function requestImage(
  apiKey: string,
  prompt: string,
  model: string
): Promise<{ bytes: Buffer; mime: string } | { error: string }> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      size: "1024x1024",
      quality: "medium",
      output_format: "jpeg",
    }),
  });
  const detail = await response.text().catch(() => "");
  if (!response.ok) {
    console.warn(
      "[promotions] image generation failed",
      model,
      response.status,
      detail.slice(0, 180)
    );
    return { error: imageErrorMessage(detail, response.status) };
  }
  let payload: { data?: Array<{ b64_json?: string }> } = {};
  try {
    payload = JSON.parse(detail) as { data?: Array<{ b64_json?: string }> };
  } catch {
    return { error: "Image generation returned an unreadable response" };
  }
  const b64 = payload.data?.[0]?.b64_json;
  if (!b64) return { error: "Image generation returned no image" };
  return { bytes: Buffer.from(b64, "base64"), mime: "image/jpeg" };
}

function imageErrorMessage(detail: string, status: number): string {
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string } };
    const message = parsed.error?.message?.trim();
    if (message) return message.slice(0, 240);
  } catch {
    // The body was not JSON.
  }
  return `Image generation failed (${status})`;
}
