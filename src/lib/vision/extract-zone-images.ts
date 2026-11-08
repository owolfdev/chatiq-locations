/**
 * OpenAI vision extract for mapper photos.
 * Adapted from ChatIQ `src/lib/locations/extract-zone-scan.ts`.
 */

import {
  getMergeExtractionSystemPrompt,
  getSingleImageExtractionSystemPrompt,
  type ExtractionMode,
} from "./extraction-mode";

const DEFAULT_MODEL = "gpt-5-mini";
const IMAGE_EXTRACTION_CONCURRENCY = 2;
const SINGLE_IMAGE_MAX_COMPLETION_TOKENS = 4096;
const MERGE_MAX_COMPLETION_TOKENS = 1600;
const MAX_IMAGES = 12;

export type ExtractedZoneItem = {
  canonical_name: string;
  entity_type?: string | null;
  brand: string | null;
  variant: string | null;
  size_text: string | null;
  observed_price_text: string | null;
  shelf_hint: string | null;
  confidence: number | null;
};

export type ExtractedZonePayload = {
  zone_summary: string;
  visible_sections: string[];
  nearby_landmarks: string[];
  observed_categories: string[];
  observed_items: ExtractedZoneItem[];
  notes: string[];
};

export type ZoneImageInput = {
  /** data:image/...;base64,... or https URL */
  image_url: string;
  source_hint?: string | null;
};

export type ExtractZoneImagesInput = {
  placeName: string;
  zoneType: string;
  zoneLabel: string;
  extractionMode?: ExtractionMode;
  images: ZoneImageInput[];
};

export type ExtractZoneImagesResult = {
  merged: ExtractedZonePayload;
  extraction_failures: Array<{
    image_index: number;
    source_hint: string | null;
    error: string;
  }>;
  draftText: string;
};

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is not set on chatiq-locations (required for vision extract)."
    );
  }
  return key;
}

function getModel(): string {
  return process.env.LOCATIONS_VISION_MODEL?.trim() || DEFAULT_MODEL;
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return Math.round(value * 100) / 100;
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  );
}

function truncateText(value: string, maxLength = 180) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}...`;
}

export function normalizeExtractedZonePayload(
  payload: unknown,
  fallbackSummary: string
): ExtractedZonePayload {
  const parsed =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};

  const observedItems = Array.isArray(parsed.observed_items)
    ? parsed.observed_items
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const record = item as Record<string, unknown>;
          return {
            canonical_name:
              toNullableString(record.canonical_name) ?? "Unknown item",
            entity_type: toNullableString(record.entity_type) ?? "product",
            brand: toNullableString(record.brand),
            variant: toNullableString(record.variant),
            size_text: toNullableString(record.size_text),
            observed_price_text: toNullableString(record.observed_price_text),
            shelf_hint: toNullableString(record.shelf_hint),
            confidence: toConfidence(record.confidence),
          };
        })
        .filter((item) => item.canonical_name !== "Unknown item")
    : [];

  return {
    zone_summary: toNullableString(parsed.zone_summary) ?? fallbackSummary,
    visible_sections: toStringArray(parsed.visible_sections),
    nearby_landmarks: toStringArray(parsed.nearby_landmarks),
    observed_categories: toStringArray(parsed.observed_categories),
    observed_items: observedItems,
    notes: toStringArray(parsed.notes),
  };
}

function buildObservedItemKey(item: ExtractedZoneItem) {
  return [
    item.canonical_name.trim().toLowerCase(),
    item.entity_type?.trim().toLowerCase() ?? "product",
    item.brand?.trim().toLowerCase() ?? "",
    item.variant?.trim().toLowerCase() ?? "",
    item.size_text?.trim().toLowerCase() ?? "",
  ].join("|");
}

function mergeObservedItems(
  payloads: ExtractedZonePayload[]
): ExtractedZoneItem[] {
  const merged = new Map<string, ExtractedZoneItem>();
  for (const payload of payloads) {
    for (const item of payload.observed_items) {
      const key = buildObservedItemKey(item);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...item });
        continue;
      }
      const preferred =
        (item.confidence ?? -1) > (existing.confidence ?? -1) ? item : existing;
      const fallback = preferred === item ? existing : item;
      merged.set(key, {
        canonical_name: preferred.canonical_name || fallback.canonical_name,
        entity_type: preferred.entity_type ?? fallback.entity_type ?? "product",
        brand: preferred.brand ?? fallback.brand,
        variant: preferred.variant ?? fallback.variant,
        size_text: preferred.size_text ?? fallback.size_text,
        observed_price_text:
          preferred.observed_price_text ?? fallback.observed_price_text,
        shelf_hint: preferred.shelf_hint ?? fallback.shelf_hint,
        confidence: preferred.confidence ?? fallback.confidence ?? null,
      });
    }
  }
  return Array.from(merged.values()).sort((a, b) => {
    const d = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (d !== 0) return d;
    return a.canonical_name.localeCompare(b.canonical_name);
  });
}

function mergeExtractedZonePayloadsDeterministically({
  payloads,
  fallbackSummary,
}: {
  payloads: ExtractedZonePayload[];
  fallbackSummary: string;
}): ExtractedZonePayload {
  const summaries = payloads
    .map((p) => p.zone_summary.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  return {
    zone_summary: summaries[0] ?? fallbackSummary,
    visible_sections: uniqueStrings(
      payloads.flatMap((p) => p.visible_sections)
    ),
    nearby_landmarks: uniqueStrings(
      payloads.flatMap((p) => p.nearby_landmarks)
    ),
    observed_categories: uniqueStrings(
      payloads.flatMap((p) => p.observed_categories)
    ),
    observed_items: mergeObservedItems(payloads),
    notes: uniqueStrings(payloads.flatMap((p) => p.notes)),
  };
}

/** Format for mapper Text/speak + heuristic normalize. */
export function draftTextFromExtraction(input: {
  zoneType: string;
  zoneLabel: string;
  payload: ExtractedZonePayload;
}): string {
  const names = input.payload.observed_items
    .map((item) => {
      const name = item.canonical_name.trim();
      if (!name) return "";
      // Brand prefix when not already in the product name
      if (item.brand && !name.toLowerCase().includes(item.brand.toLowerCase())) {
        return `${item.brand.trim()} ${name}`.trim();
      }
      return name;
    })
    .filter(Boolean);

  const unique = uniqueStrings(names);
  const zonePrefix =
    input.zoneType === "aisle"
      ? `aisle ${input.zoneLabel}`
      : `${input.zoneType} ${input.zoneLabel}`.trim();

  if (unique.length === 0) {
    return zonePrefix;
  }
  return `${zonePrefix}. ${unique.join(", ")}`;
}

function extractCompletionText(completion: {
  choices?: Array<{
    message?: {
      content?:
        | string
        | null
        | Array<
            | string
            | {
                type?: string;
                text?: string | { value?: string | null } | null;
              }
          >;
      refusal?: string | null;
    };
    finish_reason?: string | null;
  }>;
}, errorPrefix: string) {
  const choice = completion.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") return part.trim();
        if (!part || typeof part !== "object") return "";
        if (typeof part.text === "string") return part.text.trim();
        if (
          part.text &&
          typeof part.text === "object" &&
          typeof part.text.value === "string"
        ) {
          return part.text.value.trim();
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text;
  }
  const refusal =
    typeof choice?.message?.refusal === "string"
      ? choice.message.refusal.trim()
      : "";
  const finishReason =
    typeof choice?.finish_reason === "string" ? choice.finish_reason.trim() : "";
  const details = [finishReason && `finish_reason=${finishReason}`, refusal]
    .filter(Boolean)
    .join("; ");
  throw new Error(
    details
      ? `${errorPrefix}: model returned no content (${details}).`
      : `${errorPrefix}: model returned no content.`
  );
}

async function requestStructuredJson({
  systemPrompt,
  userContent,
  maxCompletionTokens,
  errorPrefix,
}: {
  systemPrompt: string;
  userContent: string | Array<Record<string, unknown>>;
  maxCompletionTokens: number;
  errorPrefix: string;
}) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: getModel(),
      response_format: { type: "json_object" },
      max_completion_tokens: maxCompletionTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`${errorPrefix}: ${payload}`);
  }

  const completion = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown;
        refusal?: string | null;
      };
      finish_reason?: string | null;
    }>;
  };

  const content = extractCompletionText(
    completion as Parameters<typeof extractCompletionText>[0],
    errorPrefix
  );
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `${errorPrefix}: malformed JSON (${error.message}).`
        : `${errorPrefix}: malformed JSON.`
    );
  }
}

async function mapWithConcurrency<T, TResult>({
  items,
  concurrency,
  worker,
}: {
  items: T[];
  concurrency: number;
  worker: (item: T, index: number) => Promise<TResult>;
}) {
  const results = new Array<TResult>(items.length);
  let cursor = 0;
  async function consume() {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => consume())
  );
  return results;
}

function buildContextText(input: ExtractZoneImagesInput, mode: ExtractionMode) {
  return [
    `Place: ${input.placeName}`,
    `Zone: ${input.zoneType} ${input.zoneLabel}`.trim(),
    `Extraction mode: ${mode}`,
  ].join("\n");
}

export async function extractZoneImages(
  input: ExtractZoneImagesInput
): Promise<ExtractZoneImagesResult> {
  getApiKey(); // fail fast
  const mode = input.extractionMode ?? "product";
  const images = input.images
    .filter((img) => typeof img.image_url === "string" && img.image_url.length > 0)
    .slice(0, MAX_IMAGES);

  if (images.length === 0) {
    throw new Error("No images provided for extraction.");
  }

  const fallbackSummary = `${input.zoneType} ${input.zoneLabel}`.trim();
  const contextText = buildContextText(input, mode);

  type Attempt =
    | {
        ok: true;
        extraction: {
          image_index: number;
          source_hint: string | null;
          payload: ExtractedZonePayload;
        };
      }
    | {
        ok: false;
        image_index: number;
        source_hint: string | null;
        error: string;
      };

  const attempts = await mapWithConcurrency({
    items: images,
    concurrency: IMAGE_EXTRACTION_CONCURRENCY,
    worker: async (asset, index): Promise<Attempt> => {
      try {
        const parsed = await requestStructuredJson({
          systemPrompt: getSingleImageExtractionSystemPrompt(mode),
          userContent: [
            {
              type: "text",
              text: [
                contextText,
                `Image ${index + 1} of ${images.length}.`,
                `Image hint: ${asset.source_hint ?? "none"}`,
                "Task: extract the visible products, categories, prices if legible, and useful landmarks from this image only.",
              ].join("\n"),
            },
            {
              type: "image_url",
              image_url: { url: asset.image_url },
            },
          ],
          maxCompletionTokens: SINGLE_IMAGE_MAX_COMPLETION_TOKENS,
          errorPrefix: `Image ${index + 1} extraction failed`,
        });
        return {
          ok: true,
          extraction: {
            image_index: index + 1,
            source_hint: asset.source_hint ?? null,
            payload: normalizeExtractedZonePayload(parsed, fallbackSummary),
          },
        };
      } catch (error) {
        return {
          ok: false,
          image_index: index + 1,
          source_hint: asset.source_hint ?? null,
          error:
            error instanceof Error && error.message.trim()
              ? error.message
              : "Unknown image extraction error.",
        };
      }
    },
  });

  const successful = attempts
    .filter((a): a is Extract<Attempt, { ok: true }> => a.ok)
    .map((a) => a.extraction);
  const extraction_failures = attempts
    .filter((a): a is Extract<Attempt, { ok: false }> => !a.ok)
    .map((a) => ({
      image_index: a.image_index,
      source_hint: a.source_hint,
      error: a.error,
    }));

  if (successful.length === 0) {
    throw new Error(
      extraction_failures[0]?.error ?? "All image extractions failed."
    );
  }

  let merged: ExtractedZonePayload;
  try {
    if (successful.length === 1) {
      merged = successful[0].payload;
    } else {
      const parsed = await requestStructuredJson({
        systemPrompt: getMergeExtractionSystemPrompt(mode),
        userContent: [
          contextText,
          `Uploaded images processed: ${successful.length}.`,
          "Merge the following per-image extraction results into one zone-wide payload:",
          JSON.stringify(successful, null, 2),
        ].join("\n\n"),
        maxCompletionTokens: MERGE_MAX_COMPLETION_TOKENS,
        errorPrefix: "Zone merge failed",
      });
      merged = normalizeExtractedZonePayload(parsed, fallbackSummary);
    }
  } catch (error) {
    console.error("[locations-vision] merge fallback", error);
    merged = mergeExtractedZonePayloadsDeterministically({
      payloads: successful.map((s) => s.payload),
      fallbackSummary,
    });
  }

  if (extraction_failures.length > 0) {
    merged = {
      ...merged,
      notes: uniqueStrings([
        ...merged.notes,
        `${successful.length} of ${images.length} images extracted successfully.`,
        ...extraction_failures.slice(0, 3).map(
          (f) =>
            `Image ${f.image_index}${f.source_hint ? ` (${f.source_hint})` : ""}: ${truncateText(f.error)}`
        ),
      ]),
    };
  }

  const draftText = draftTextFromExtraction({
    zoneType: input.zoneType,
    zoneLabel: input.zoneLabel,
    payload: merged,
  });

  return { merged, extraction_failures, draftText };
}

export async function fileToDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}
