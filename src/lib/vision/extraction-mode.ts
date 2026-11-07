/** Ported from ChatIQ `extraction-mode.ts` — product mode is the mapper default. */

export const EXTRACTION_MODE_VALUES = [
  "product",
  "store",
  "facility",
  "mixed",
] as const;

export type ExtractionMode = (typeof EXTRACTION_MODE_VALUES)[number];

export const OBSERVED_ITEM_SCHEMA_LITERAL =
  '{"zone_summary":string,"visible_sections":string[],"nearby_landmarks":string[],"observed_categories":string[],"observed_items":[{"canonical_name":string,"entity_type":string|null,"description":string|null,"brand":string|null,"variant":string|null,"size_text":string|null,"observed_price_text":string|null,"shelf_hint":string|null,"navigation_hint":string|null,"navigation_data":object|null,"official_bot_url":string|null,"linked_place_ref":string|null,"confidence":number|null}],"notes":string[]}';

const PRODUCT_SINGLE =
  "You analyze one retail shelf image from a larger location-mapping survey. " +
  `Return only valid JSON with this exact shape: ${OBSERVED_ITEM_SCHEMA_LITERAL}. ` +
  "observed_items should mainly be products. " +
  "For products, use brand, variant, size_text, observed_price_text, and shelf_hint when visible. " +
  "Set entity_type to product unless the image clearly contains a different destination-style entity. " +
  "Describe only what is supported by this single image. " +
  "Do not attempt to summarize the entire zone from one image. " +
  "Be conservative and leave uncertain fields empty or null.";

const PRODUCT_MERGE =
  "You merge multiple image-level retail shelf extraction JSON results into one final zone-wide result. " +
  `Return only valid JSON with this exact shape: ${OBSERVED_ITEM_SCHEMA_LITERAL}. ` +
  "Use all image evidence for coverage. Deduplicate repeated products seen in multiple images. " +
  "Keep distinct variants separate when the label or variant is meaningfully different. " +
  "Prefer the most specific legible price. Be conservative and do not invent zone-wide facts that are not supported.";

export function normalizeExtractionMode(
  value: string | null | undefined
): ExtractionMode {
  if (value && EXTRACTION_MODE_VALUES.includes(value as ExtractionMode)) {
    return value as ExtractionMode;
  }
  return "product";
}

export function getSingleImageExtractionSystemPrompt(mode: ExtractionMode) {
  // Mapper v1: product prompts for all modes (extend later if needed)
  void mode;
  return PRODUCT_SINGLE;
}

export function getMergeExtractionSystemPrompt(mode: ExtractionMode) {
  void mode;
  return PRODUCT_MERGE;
}
