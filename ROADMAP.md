# What’s next — `chatiq-locations`

Last updated: 2026-11-04

**Start here for this repo.** Mission: [`dev_docs/_mission-locations-sibling-v1.md`](./dev_docs/_mission-locations-sibling-v1.md).  
Principles: [`dev_docs/organic-mapping.md`](./dev_docs/organic-mapping.md) · Salvage: [`dev_docs/locations-salvage.md`](./dev_docs/locations-salvage.md) · Commands: [`dev_docs/locations-command-library.md`](./dev_docs/locations-command-library.md).

Workspace index (not in git): [`../ROADMAP.md`](../ROADMAP.md). Design history also lives under [`../chatiq/dev_docs/item-location-knowledge/`](../chatiq/dev_docs/item-location-knowledge/) until cutover.

Local: `npm run dev` → **port 3004**. Env: [`.env.example`](./.env.example) (`LOCATIONS_SERVICE_TOKEN`).

## North star

Operators map a store **organically** (place → zones/items anytime, multi-agent). Shoppers get honest place-scoped “where is X?” from **published** knowledge. Vision accelerates mapping; it is not required for a first useful publish. ChatIQ stays a thin adapter + `locations_mode` gate.

## Phased plan

### Phase 0 — Skeleton

| Work | Status |
|------|--------|
| Create `chatiq-locations` git + app skeleton | ✅ 2026-11-04 |
| `GET /api/health` + `LOCATIONS_SERVICE_TOKEN` contract | ✅ |
| Commands execute stub (`NOT_IMPLEMENTED`) + auth | ✅ 2026-11-05 |
| ChatIQ adapter stub + fail closed; no calls when gated off | ✅ 2026-11-05 (in `chatiq`) |
| Core SQL migration draft + supabase client/probe | ✅ 2026-11-05 |
| Shared booking Supabase + apply `_locations_*` migration | ✅ 2026-11-05 |
| Vercel project + production deploy | ✅ https://chatiq-locations.vercel.app (health green 2026-11-06) |

### Phase 1 — Organic data + commands (manual path)

| Work | Status |
|------|--------|
| Places · layouts · zones · publications SoT (`_locations_*` on shared booking DB) | Schema v0 drafted; apply migration |
| Staff: `place.*` / `zone.*` / `zone.publish` | ✅ 2026-11-05 |
| Guest: `places.list` / `place.get_context` / `map.resolve_item` / coverage / place map | ✅ 2026-11-05 |
| Smoke: create place → zone → one item → publish → resolve | `npm run smoke:organic` |
| Operator UI: minimal place/zone/item + publish | Not started |

**Pilot DoD (manual):** Allowlisted bot answers “where is oat milk?” from a manually published zone — **no vision**.

### Phase 2 — Extraction salvage

| Work | Status |
|------|--------|
| Staged multi-image jobs + telemetry (`extract.job_*`) | Not started |
| 1 / 3 / 8 image ladder green | Not started |
| Review pending JSON → publish | Not started |
| Retain per-image payloads + `failure_reason` | Not started |

### Phase 3 — Concierge thin path

| Work | Status |
|------|--------|
| `locations_mode=full` + sibling env → places.list + map.resolve_item | ✅ 2026-11-06 (ChatIQ wire) |
| Demote/delete in-process `locations-flow` / extract in ChatIQ | Partial — sibling path preferred when gated; legacy still present when sibling off |
| Pilot smoke end-to-end in chat | Needs place linked to real bot_id + `locations_mode=full` |

### Phase 4 — Strangler closeout

| Work | Status |
|------|--------|
| Stop ChatIQ writing location truth | Not started |
| Archive legacy Locations routes that bypass sibling | Not started |
| Point all roadmaps / `_active-focus` at sibling only | Not started |

## Explicitly later

Geo place pick · recipe shopping · field-level review UI · mobile capture · ERP inventory.

## Progress snapshot

```text
chatiq-locations: sibling v1: [############________] ~58% -> ChatIQ wire live; pilot chat smoke next
```
