#!/usr/bin/env node
/**
 * Phase 1 smoke: place → zone → item → publish → resolve
 * Usage: node scripts/smoke-organic.mjs
 * Requires: LOCATIONS_SERVICE_TOKEN + Supabase env (from .env.local via process, or export)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
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
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const BASE = (process.env.LOCATIONS_SMOKE_URL || "http://localhost:3004").replace(
  /\/+$/,
  ""
);
const TOKEN = process.env.LOCATIONS_SERVICE_TOKEN || "";
const TEAM_ID =
  process.env.LOCATIONS_SMOKE_TEAM_ID || "00000000-0000-4000-8000-000000000001";
const BOT_ID =
  process.env.LOCATIONS_SMOKE_BOT_ID || "00000000-0000-4000-8000-000000000002";

async function exec(command, slots) {
  const res = await fetch(`${BASE}/api/v1/commands/execute`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({
      contract_version: "0.1.0",
      command,
      slots,
      actor: { kind: "staff", team_id: TEAM_ID, bot_id: BOT_ID },
    }),
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(
      `${command} failed (${res.status}): ${json.code} ${json.error}`
    );
  }
  console.log(`✓ ${command}`, JSON.stringify(json.data));
  return json.data;
}

async function main() {
  console.log(`Smoke against ${BASE}`);
  const created = await exec("place.create", {
    team_id: TEAM_ID,
    name: `Smoke Store ${Date.now()}`,
    address: "Test Lane",
    bot_id: BOT_ID,
  });
  const placeId = created.place.id;
  const layoutId = created.layout_version_id;
  if (!layoutId) throw new Error("expected layout_version_id from place.create");

  const zone = await exec("zone.upsert", {
    team_id: TEAM_ID,
    layout_version_id: layoutId,
    zone_type: "aisle",
    zone_label: "15",
    near_landmark: "near produce",
  });

  await exec("zone.set_items", {
    team_id: TEAM_ID,
    zone_id: zone.zone.id,
    mode: "replace",
    items: [{ canonical_name: "oat milk", brand: "SmokeBrand" }],
  });

  await exec("zone.publish", {
    team_id: TEAM_ID,
    zone_id: zone.zone.id,
  });

  const resolved = await exec("map.resolve_item", {
    place_id: placeId,
    item_query: "oat milk",
  });

  if (!resolved.matches?.length) {
    throw new Error("expected at least one match for oat milk");
  }
  console.log("\nPhase 1 organic smoke passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
