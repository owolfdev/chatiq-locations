import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { join } from "node:path";

function loadEnv(path: string) {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const locEnv = loadEnv(".env.local");
const chatEnv = loadEnv("../chatiq/.env.local");
const locations = createClient(
  locEnv.NEXT_PUBLIC_SUPABASE_URL!,
  locEnv.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } }
);
const chatiq = createClient(
  chatEnv.NEXT_PUBLIC_SUPABASE_URL!,
  chatEnv.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const BOT_ID = "32e70428-944c-4f83-a8a0-b622c75b6af7";
const PLACE_ID = "07ddb30a-09d6-4254-8dc1-be10597403fc";

const { data: bot, error: botErr } = await chatiq
  .from("bot_bots")
  .select(
    "id, name, slug, team_id, locations_mode, status, is_public, description, languages, created_at"
  )
  .eq("id", BOT_ID)
  .single();
if (botErr) throw botErr;

const { data: place, error: placeErr } = await locations
  .from("_locations_places")
  .select("*")
  .eq("id", PLACE_ID)
  .single();
if (placeErr) throw placeErr;

const { data: links } = await locations
  .from("_locations_place_bots")
  .select("*")
  .eq("place_id", PLACE_ID);

const { data: layouts } = await locations
  .from("_locations_layout_versions")
  .select("*")
  .eq("place_id", PLACE_ID);

const { data: zones } = await locations
  .from("_locations_zones")
  .select("*")
  .eq("place_id", PLACE_ID)
  .order("zone_label");

const { data: pubs } = await locations
  .from("_locations_zone_publications")
  .select(
    "id, zone_id, title, summary, publication_status, is_current, published_at, items_snapshot, content"
  )
  .eq("place_id", PLACE_ID)
  .eq("is_current", true)
  .eq("publication_status", "published");

const zoneItems: Record<string, unknown[]> = {};
for (const z of zones || []) {
  const { data: items } = await locations
    .from("_locations_zone_items")
    .select(
      "id, zone_id, canonical_name, raw_label, brand, variant, size_text, category_labels, shelf_hint"
    )
    .eq("zone_id", z.id)
    .order("canonical_name");
  zoneItems[z.id] = items || [];
}

const inventory = (pubs || []).map((p) => {
  const zone = (zones || []).find((z) => z.id === p.zone_id);
  const snap = Array.isArray(p.items_snapshot) ? p.items_snapshot : [];
  return {
    zone_id: p.zone_id,
    zone_type: zone?.zone_type,
    zone_label: zone?.zone_label,
    near_landmark: zone?.near_landmark,
    publication_id: p.id,
    title: p.title,
    item_count: snap.length,
    sample_items: snap
      .slice(0, 15)
      .map((i: { canonical_name?: string; raw_label?: string }) =>
        i.canonical_name || i.raw_label
      ),
  };
});

const allNames: Array<{ zone: string; name: string; brand: string | null }> =
  [];
for (const p of pubs || []) {
  for (const i of p.items_snapshot || []) {
    allNames.push({
      zone: p.title,
      name: i.canonical_name || i.raw_label || "",
      brand: i.brand || null,
    });
  }
}
allNames.sort((a, b) => a.name.localeCompare(b.name));

const outDir = join(process.cwd(), "dev_docs", "examination", "gourmet-bangkapi");
mkdirSync(outDir, { recursive: true });

const bundle = {
  exported_at: new Date().toISOString(),
  bot,
  place,
  place_bots: links,
  layout_versions: layouts,
  zones,
  zone_items_by_zone_id: zoneItems,
  current_publications: pubs || [],
  inventory_summary: inventory,
  totals: {
    zones: zones?.length || 0,
    published_zones: pubs?.length || 0,
    draft_zone_items: Object.values(zoneItems).reduce(
      (n, a) => n + a.length,
      0
    ),
    published_snapshot_items: allNames.length,
  },
};

writeFileSync(join(outDir, "bundle.json"), JSON.stringify(bundle, null, 2));
writeFileSync(
  join(outDir, "published-item-index.json"),
  JSON.stringify(allNames, null, 2)
);

const zoneLines = inventory
  .map(
    (z) =>
      `- **${z.zone_type} ${z.zone_label}** — ${z.item_count} items` +
      (z.near_landmark ? ` (near: ${z.near_landmark})` : "")
  )
  .join("\n");

const md = `# Gourmet Market Bangkapi — isolated examination pack

Exported: ${bundle.exported_at}

## Bot (ChatIQ)

| Field | Value |
|------|-------|
| id | \`${bot.id}\` |
| name | ${bot.name} |
| slug | \`${bot.slug}\` |
| locations_mode | \`${bot.locations_mode}\` |
| team_id | \`${bot.team_id}\` |
| chat path | \`/chat/${bot.slug}\` |

## Place (chatiq-locations)

| Field | Value |
|------|-------|
| id | \`${place.id}\` |
| name | ${place.name} |
| address | ${place.address || ""} |
| primary_bot_id | \`${place.primary_bot_id}\` |
| is_active | ${place.is_active} |

## Coverage

- Zones: **${bundle.totals.zones}**
- Published zones: **${bundle.totals.published_zones}**
- Items in draft zone tables: **${bundle.totals.draft_zone_items}**
- Items in published snapshots (what resolve uses): **${bundle.totals.published_snapshot_items}**

### Published zones

${zoneLines}

## Files in this folder

- \`README.md\` — this summary
- \`bundle.json\` — full bot/place/zones/items/publications dump
- \`published-item-index.json\` — flat sorted list of published item names (for grep)

## Resolve smoke (expected)

**Not on map:** peanut butter, cereal, flour → empty matches (honest “ask staff”).

**On map examples:** cheese, sausage, packed meat, vegetables / aisle labels.
`;

writeFileSync(join(outDir, "README.md"), md);
console.log(JSON.stringify({ outDir, totals: bundle.totals, inventory }, null, 2));
