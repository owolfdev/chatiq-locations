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
const IMAGE_SIZE = "1536x1024";
const FRAME =
  "Show the complete design in one frame. Leave a clear margin on every side. Every word, the logo, and the product must be fully visible, with nothing cut off or touching the edge. If something does not fit, make it smaller.";

export type PromotionLogoFile = {
  bytes: Buffer;
  mime: string;
  filename: string;
};

export async function generatePromotionImageBytes(
  prompt: string,
  logo?: PromotionLogoFile | null
): Promise<{ bytes: Buffer; mime: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Image generation is not configured");
  const text = prompt.trim();
  if (!text) throw new Error("Enter a prompt");
  const instruction = logo
    ? `The attached image is the store logo. Include that logo in the promotional image. Keep its shapes, colors, and any lettering as close to the attached image as you can.\n\n${FRAME}\n\n${text}`
    : `${FRAME}\n\n${text}`;

  let lastError = "Image generation failed";
  for (const model of IMAGE_MODELS) {
    const generated = await requestImage(apiKey, instruction, model, logo);
    if ("bytes" in generated) return generated;
    lastError = generated.error;
  }
  throw new Error(lastError);
}

async function requestImage(
  apiKey: string,
  prompt: string,
  model: string,
  logo?: PromotionLogoFile | null
): Promise<{ bytes: Buffer; mime: string } | { error: string }> {
  const response = logo
    ? await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: logoEditBody({ model, prompt, logo }),
      })
    : await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          size: IMAGE_SIZE,
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

export async function downloadStoredPromotionImage(
  imagePath: string
): Promise<Buffer | null> {
  const supabase = createLocationsAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(LOCATIONS_PROMOTIONS_BUCKET)
    .download(imagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

function logoEditBody(input: {
  model: string;
  prompt: string;
  logo: PromotionLogoFile;
}): FormData {
  const form = new FormData();
  form.set("model", input.model);
  form.set("prompt", input.prompt);
  form.set("size", IMAGE_SIZE);
  form.set("quality", "medium");
  form.set("output_format", "jpeg");
  form.set("input_fidelity", "high");
  form.append(
    "image",
    new Blob([new Uint8Array(input.logo.bytes)], { type: input.logo.mime }),
    input.logo.filename
  );
  return form;
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
