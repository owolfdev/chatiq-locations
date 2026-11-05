#!/usr/bin/env node
/**
 * Import published places/zones/items from ChatIQ `bot_*` tables into
 * shared booking DB `_locations_*` tables (preserve UUIDs).
 *
 * Usage (from chatiq-locations/):
 *   node scripts/import-from-chatiq.mjs
 *   node scripts/import-from-chatiq.mjs --dry-run
 *
 * Reads:
 *   ../chatiq/.env.local  → source (ChatIQ Supabase)
 *   ./.env.local          → dest (booking / locations Supabase)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DRY = process.argv.includes("--dry-run");

function loadEnv(path) {
  const out = {};
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

function clientFromEnv(env, label) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    env.SUPABASE_SECRET_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(`Missing Supabase URL/secret for ${label}`);
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchAll(sb, table, select, filterFn) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    let q = sb.from(table).select(select).range(from, from + pageSize - 1);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function main() {
  const srcEnv = loadEnv(resolve(process.cwd(), "../chatiq/.env.local"));
  const dstEnv = loadEnv(resolve(process.cwd(), ".env.local"));
  const src = clientFromEnv(srcEnv, "ChatIQ");
  const dst = clientFromEnv(dstEnv, "locations");

  if (srcEnv.NEXT_PUBLIC_SUPABASE_URL === dstEnv.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Source and dest Supabase URL are the same — aborting");
  }

  console.log(DRY ? "DRY RUN" : "IMPORT");
  console.log("src", srcEnv.NEXT_PUBLIC_SUPABASE_URL);
  console.log("dst", dstEnv.NEXT_PUBLIC_SUPABASE_URL);

  const places = await fetchAll(
    src,
    "bot_places",
    "id, team_id, primary_bot_id, name, address, latitude, longitude, metadata, is_active, created_at, updated_at",
    (q) => q.eq("is_active", true).order("name")
  );
  console.log(`places: ${places.length}`);

  const layouts = await fetchAll(
    src,
    "bot_place_layout_versions",
    "id, team_id, place_id, name, status, notes, effective_at, archived_at, created_at, updated_at"
  );
  const zones = await fetchAll(
    src,
    "bot_place_zones",
    "id, team_id, place_id, layout_version_id, parent_zone_id, zone_type, zone_label, zone_description, near_landmark, placement_note, sort_order, is_active, created_at, updated_at",
    (q) => q.eq("is_active", true)
  );
  const pubs = await fetchAll(
    src,
    "bot_zone_publications",
    "id, team_id, place_id, layout_version_id, zone_id, source_zone_scan_id, title, content, summary, publication_status, is_current, metadata, published_at, created_at, updated_at",
    (q) => q.eq("is_current", true).eq("publication_status", "published")
  );

  console.log(
    `layouts=${layouts.length} active_zones=${zones.length} published=${pubs.length}`
  );

  const publishedZoneIds = new Set(pubs.map((p) => p.zone_id));
  const zonesToImport = zones.filter((z) => publishedZoneIds.has(z.id));
  const placeIds = new Set(places.map((p) => p.id));
  const layoutsToImport = layouts.filter((l) => placeIds.has(l.place_id));

  // Observations for published zones only (item type)
  const observations = [];
  for (const zoneId of publishedZoneIds) {
    const rows = await fetchAll(
      src,
      "bot_zone_observations",
      "id, team_id, zone_id, observation_type, canonical_name, raw_label, brand, variant, size_text, raw_category_labels, shelf_hint, metadata, created_at",
      (q) => q.eq("zone_id", zoneId).eq("observation_type", "item")
    );
    observations.push(...rows);
  }
  console.log(`item observations: ${observations.length}`);

  if (DRY) {
    for (const p of places) {
      const zc = zonesToImport.filter((z) => z.place_id === p.id).length;
      const ic = observations.filter((o) =>
        zonesToImport.some((z) => z.id === o.zone_id && z.place_id === p.id)
      ).length;
      console.log(`  ${p.name}: zones=${zc} items≈${ic}`);
    }
    return;
  }

  // Upsert places
  const placeRows = places.map((p) => ({
    id: p.id,
    team_id: p.team_id,
    primary_bot_id: p.primary_bot_id,
    name: p.name,
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    metadata: p.metadata || {},
    is_active: p.is_active,
    created_at: p.created_at,
    updated_at: p.updated_at || p.created_at,
  }));
  {
    const { error } = await dst
      .from("_locations_places")
      .upsert(placeRows, { onConflict: "id" });
    if (error) throw new Error(`places upsert: ${error.message}`);
  }

  // place_bots
  const botLinks = places
    .filter((p) => p.primary_bot_id)
    .map((p) => ({ place_id: p.id, bot_id: p.primary_bot_id }));
  if (botLinks.length) {
    const { error } = await dst
      .from("_locations_place_bots")
      .upsert(botLinks, { onConflict: "place_id,bot_id" });
    if (error) throw new Error(`place_bots upsert: ${error.message}`);
  }

  // layouts
  const layoutRows = layoutsToImport.map((l) => ({
    id: l.id,
    team_id: l.team_id,
    place_id: l.place_id,
    name: l.name || "Current layout",
    status: l.status || "active",
    notes: l.notes,
    effective_at: l.effective_at,
    archived_at: l.archived_at,
    created_at: l.created_at,
    updated_at: l.updated_at || l.created_at,
  }));
  if (layoutRows.length) {
    const { error } = await dst
      .from("_locations_place_layout_versions")
      .upsert(layoutRows, { onConflict: "id" });
    if (error) throw new Error(`layouts upsert: ${error.message}`);
  }

  // zones (published only)
  const zoneRows = zonesToImport.map((z) => ({
    id: z.id,
    team_id: z.team_id,
    place_id: z.place_id,
    layout_version_id: z.layout_version_id,
    parent_zone_id: z.parent_zone_id,
    zone_type: z.zone_type,
    zone_label: z.zone_label,
    zone_description: z.zone_description,
    near_landmark: z.near_landmark,
    placement_note: z.placement_note,
    sort_order: z.sort_order ?? 0,
    is_active: true,
    created_at: z.created_at,
    updated_at: z.updated_at || z.created_at,
  }));
  if (zoneRows.length) {
    const { error } = await dst
      .from("_locations_zones")
      .upsert(zoneRows, { onConflict: "id" });
    if (error) throw new Error(`zones upsert: ${error.message}`);
  }

  // Replace zone_items for imported zones
  for (const zoneId of publishedZoneIds) {
    await dst.from("_locations_zone_items").delete().eq("zone_id", zoneId);
  }
  const itemRows = observations
    .map((o) => {
      const name = (o.canonical_name || o.raw_label || "").trim();
      if (!name) return null;
      return {
        team_id: o.team_id,
        zone_id: o.zone_id,
        canonical_name: name,
        raw_label: o.raw_label,
        brand: o.brand,
        variant: o.variant,
        size_text: o.size_text,
        category_labels: o.raw_category_labels,
        shelf_hint: o.shelf_hint,
        metadata: o.metadata || {},
        created_at: o.created_at,
        updated_at: o.created_at,
      };
    })
    .filter(Boolean);

  for (let i = 0; i < itemRows.length; i += 500) {
    const chunk = itemRows.slice(i, i + 500);
    const { error } = await dst.from("_locations_zone_items").insert(chunk);
    if (error) throw new Error(`zone_items insert: ${error.message}`);
  }
  console.log(`zone_items inserted: ${itemRows.length}`);

  // publications with items_snapshot
  const itemsByZone = new Map();
  for (const row of itemRows) {
    const list = itemsByZone.get(row.zone_id) || [];
    list.push({
      canonical_name: row.canonical_name,
      raw_label: row.raw_label,
      brand: row.brand,
      variant: row.variant,
      size_text: row.size_text,
      category_labels: row.category_labels,
      shelf_hint: row.shelf_hint,
    });
    itemsByZone.set(row.zone_id, list);
  }

  // Clear current flags for these places then upsert pubs
  for (const placeId of placeIds) {
    await dst
      .from("_locations_zone_publications")
      .update({ is_current: false, publication_status: "superseded" })
      .eq("place_id", placeId)
      .eq("is_current", true);
  }

  const pubRows = pubs.map((p) => {
    const snap = itemsByZone.get(p.zone_id) || [];
    return {
      id: p.id,
      team_id: p.team_id,
      place_id: p.place_id,
      layout_version_id: p.layout_version_id,
      zone_id: p.zone_id,
      title: p.title,
      content: p.content || p.title,
      summary: p.summary,
      items_snapshot: snap,
      publication_status: "published",
      is_current: true,
      metadata: {
        ...(p.metadata && typeof p.metadata === "object" ? p.metadata : {}),
        imported_from: "chatiq_bot_zone_publications",
      },
      published_at: p.published_at || p.created_at,
      created_at: p.created_at,
      updated_at: p.updated_at || p.created_at,
    };
  });

  for (let i = 0; i < pubRows.length; i += 100) {
    const chunk = pubRows.slice(i, i + 100);
    const { error } = await dst
      .from("_locations_zone_publications")
      .upsert(chunk, { onConflict: "id" });
    if (error) throw new Error(`publications upsert: ${error.message}`);
  }

  console.log(`publications upserted: ${pubRows.length}`);
  console.log("Import complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
