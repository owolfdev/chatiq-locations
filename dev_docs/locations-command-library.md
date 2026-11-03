# Locations design: LLM concierge → deterministic command library

Last updated: 2026-11-04  
Status: **Draft contract for sibling Phase 0–1** (repo not scaffolded yet)  
Principles: [`organic-mapping.md`](./organic-mapping.md) · Salvage: [`locations-salvage.md`](./locations-salvage.md)

Same split as booking: **ChatIQ LLM chooses language and intent**; **sibling executes deterministic commands** and returns structured data (or English smoke replies only for API checks).

## Transport (target)

| Version | Endpoint | Role |
|---------|----------|------|
| **v0** | `GET /api/health` · service-token on all `/api/v1/*` | Skeleton |
| **v1** | `POST /api/v1/commands/execute` | `{ command, slots, actor }` → `{ ok, data, error? }` — no shopper prose |
| Optional later | Place-map fetch for retrieval cache | Thin read for ChatIQ / bot_documents hook |

Auth: shared service token (mirror booking). Fail closed when unset.

## Actors

| Actor | Capabilities |
|-------|----------------|
| `guest` / concierge | List places (bot-scoped), get place context, resolve item → zones from **published** map, “map coverage” honesty |
| `staff` / operator | Upsert place, layout version, zone, items; start/complete extract jobs; review pending; publish |
| `system` | Job workers, publish hooks |

## Guest / concierge commands (Phase 1+)

| Command | Slots (sketch) | Returns |
|---------|----------------|---------|
| `places.list` | `bot_id` | Places available for this bot |
| `place.get_context` | `place_id` | Name, layout version id, publish freshness, zone count |
| `map.resolve_item` | `place_id`, `item_query` | Matching zones / labels / confidence; empty → honest miss |
| `map.resolve_category` | `place_id`, `category` | Zones for category if published |
| `map.coverage` | `place_id` | What is published vs draft (for “we haven’t mapped X yet”) |

**Non-goals for guest commands:** auto-switch store; invent stock; answer from unpublished drafts.

## Staff / operator commands (Phase 1 manual first)

| Command | Slots (sketch) | Returns |
|---------|----------------|---------|
| `place.create` / `place.update` | name, address?, bot links | `place_id` |
| `layout.create` / `layout.activate` | `place_id`, notes? | `layout_version_id` |
| `zone.upsert` | `layout_version_id`, `zone_type`, `zone_label`, description?, neighbors? | `zone_id` |
| `zone.set_items` | `zone_id`, items[] (append or replace flag) | Updated pending or draft snapshot |
| `zone.publish` | `zone_id` (or layout batch) | Publication id + retrieval payload summary |
| `publication.get_place_map` | `place_id` | Full published map for concierge/cache |

Organic rule: **`place.create` alone is enough to start**; zones and items can arrive anytime.

## Extraction commands (Phase 2)

| Command | Slots (sketch) | Returns |
|---------|----------------|---------|
| `extract.job_start` | `zone_id`, image refs[], mode | `job_id` |
| `extract.job_status` | `job_id` | Stage, `n/m` images, `failure_reason?` |
| `extract.job_result` | `job_id` | Pending JSON + per-image payloads |
| `extract.recombine` | `job_id`, options? | Merged pending for review |

Ladder: 1 image → 3 → 8 must show progress and durable failure, not a silent hang.

## Smoke path (Phase 1 DoD)

Without LLM vision:

1. `place.create`  
2. `zone.upsert` (aisle)  
3. `zone.set_items` (one item)  
4. `zone.publish`  
5. `map.resolve_item` → that zone  

## Open for Phase 0 scaffold

- Exact JSON schemas / error codes (`PLACE_NOT_FOUND`, `NOT_PUBLISHED`, …)  
- Bot ↔ place membership model  
- Whether ChatIQ keeps a document cache or always live-fetches map  
