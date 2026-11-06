/**
 * Heuristic freeform → zone + items (LLM normalize replaces/extends this later).
 * Examples:
 *  - "aisle 9. cereal, peanut butter"
 *  - "isle 9 cereal peanut butter"
 *  - "frozen foods: ice cream, peas"
 *  - sticky zone + "add oat milk, granola"
 */

export type NormalizedIngest = {
  zone_type: string;
  zone_label: string;
  items: string[];
  layout_note: string | null;
  source: "heuristic";
};

const FROZEN_RE =
  /\b(frozen\s+foods?|frozen\s+section|frozen\s+zone|frozen)\b/i;
const AISLE_RE =
  /\b(?:aisle|isle|section)\s*([0-9]{1,3})\b|\b([0-9]{1,3})\s*(?:aisle|isle)\b/i;
const BARE_NUM_START = /^\s*([0-9]{1,3})\b[.:,\-\s]+/;

function titleCaseLabel(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function splitItems(rest: string): string[] {
  const cleaned = rest
    .replace(/^[\s.,:;\-–—]+/, "")
    .replace(/\b(this is|items?|contains?|including)\b/gi, " ")
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(/,|;|\n| and /i)
    .map((s) => s.replace(/^[\s.•\-]+/, "").trim())
    .filter((s) => s.length >= 2 && !/^(aisle|isle|section|zone)$/i.test(s));
}

export function normalizeIngestText(input: {
  text: string;
  sticky_zone_type?: string | null;
  sticky_zone_label?: string | null;
}): NormalizedIngest | { error: string } {
  const text = input.text.trim();
  if (!text) return { error: "Empty input" };

  let zone_type: string | null = null;
  let zone_label: string | null = null;
  let rest = text;
  let layout_note: string | null = null;

  const frozen = text.match(FROZEN_RE);
  if (frozen) {
    zone_type = "section";
    zone_label = "Frozen foods";
    rest = text.replace(FROZEN_RE, " ");
  } else {
    const aisle = text.match(AISLE_RE);
    if (aisle) {
      const num = aisle[1] || aisle[2];
      zone_type = "aisle";
      zone_label = num;
      rest = text.replace(AISLE_RE, " ");
    } else {
      const bare = text.match(BARE_NUM_START);
      if (bare) {
        zone_type = "aisle";
        zone_label = bare[1];
        rest = text.slice(bare[0].length);
      }
    }
  }

  // Layout-ish phrases without SKUs
  if (
    /\b(north|south|east|west|end of the store|near the)\b/i.test(text) &&
    splitItems(rest).length === 0 &&
    !zone_type
  ) {
    layout_note = text;
    if (input.sticky_zone_type && input.sticky_zone_label) {
      return {
        zone_type: input.sticky_zone_type,
        zone_label: input.sticky_zone_label,
        items: [],
        layout_note,
        source: "heuristic",
      };
    }
    return {
      zone_type: "section",
      zone_label: "Layout notes",
      items: [],
      layout_note,
      source: "heuristic",
    };
  }

  if (!zone_type || !zone_label) {
    if (input.sticky_zone_type && input.sticky_zone_label) {
      zone_type = input.sticky_zone_type;
      zone_label = input.sticky_zone_label;
      rest = text;
    } else {
      return {
        error:
          "Could not find a zone (e.g. aisle 9 or frozen foods). Set sticky zone or include it in the text.",
      };
    }
  }

  if (zone_type === "section" && zone_label) {
    zone_label = titleCaseLabel(zone_label);
  }

  const items = splitItems(rest);
  return {
    zone_type,
    zone_label,
    items,
    layout_note,
    source: "heuristic",
  };
}
