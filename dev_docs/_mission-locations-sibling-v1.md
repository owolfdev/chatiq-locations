# Mission: Locations sibling v1 (`chatiq-locations`)

Last updated: 2026-11-04  
Status: **Phase 0 scaffolded locally** — health + env contract. Vercel + ChatIQ adapter stub still open. In-process ChatIQ Locations stays quarantined.

Owner: Engineering

**Prior art (keep; do not rewrite product model):** [`../../chatiq/dev_docs/item-location-knowledge/`](../../chatiq/dev_docs/item-location-knowledge/) design / DoD / extraction docs.  
**Pattern:** same strangler as booking → [`../../chatiq-booking/dev_docs/_mission-booking-sibling-v1.md`](../../chatiq-booking/dev_docs/_mission-booking-sibling-v1.md).  
**Repo roadmap:** [`../ROADMAP.md`](../ROADMAP.md) · Workspace index: [`../../ROADMAP.md`](../../ROADMAP.md).

**Spec pack (2026-11-04):**

| Doc | Role |
|-----|------|
| [`organic-mapping.md`](./organic-mapping.md) | Product principles — place first, any grain, multi-agent, draft vs publish |
| [`locations-salvage.md`](./locations-salvage.md) | Keep / Adapt / Defer / Drop from in-`chatiq` work |
| [`locations-command-library.md`](./locations-command-library.md) | Concierge + staff + extract command contract draft |
| [`../ROADMAP.md`](../ROADMAP.md) | Phased plan + progress snapshot |

## Resume here (next session)

**Next action (2026-11-06):** Seed a place for a real pilot bot (`place.create` with that `bot_id`), set bot `locations_mode=full`, confirm chat “where is oat milk?”. Then minimal operator UI. Extraction stays Phase 2.

ChatIQ env: `LOCATIONS_RUNTIME=sibling`, `LOCATIONS_SIBLING_URL=https://chatiq-locations.vercel.app`, matching token, optional `LOCATIONS_SIBLING_BOT_IDS`.

## Decisions (locked 2026-11-04)

| Topic | Choice |
|-------|--------|
| **Shape** | New sibling Next.js app **`chatiq-locations/`** (own git repo + Vercel project). Not a folder bolted deeper into ChatIQ. |
| **Why sibling** | Locations is a **mapping + vision + publish** product, not core chat. In-process work paused on multi-image extraction operability and polluted chat isolation — same class of problem that forced booking out. |
| **Organic mapping** | Place first; aisle/zone/item anytime; multi-agent additive; publish gates shopper answers. See [`organic-mapping.md`](./organic-mapping.md). |
| **ChatIQ touch** | Thin HTTP adapter + existing `locations_mode` gate (`off` / `shadow` / `full`). No new extraction/business logic in `handleChatRequest`. |
| **Operator UI** | Capture / zone review / publish live **in the sibling** (or ChatIQ thin UI calling sibling APIs later). Prefer sibling-first for extraction ops so vision jobs don’t share ChatIQ deploy risk. |
| **Source of truth** | Sibling DB owns places / layouts / zones / scans / publications. ChatIQ may keep thin read cache or document publish hooks only as needed for retrieval — not dual-write forever. |
| **Legacy in-`chatiq`** | Quarantined; mine schema + UX; **strangle** — do not grow extraction runtime in core. Archive/tag when sibling parity exists. |
| **Product model** | Keep: place → layout version → zone → zone_scan → publish → place-scoped concierge answers. Specs: [`item-location-knowledge-design.md`](../../chatiq/dev_docs/item-location-knowledge/item-location-knowledge-design.md), [`item-location-knowledge-v1-minimal-cut.md`](../../chatiq/dev_docs/item-location-knowledge/item-location-knowledge-v1-minimal-cut.md). |
| **Phase 1 vs 2** | **Manual** place/zone/item/publish + `map.resolve_item` first (organic). Vision extract hardens in Phase 2 — assist, not required for first pilot answer. |
| **Extraction** | Sibling owns staged multi-image pipeline + telemetry (per-image progress, failures, recombine). Fix the black box **in the sibling**, not by another monolith patch. |
| **Rollout** | Allowlist bots (mirror `BOOKING_SIBLING_BOT_IDS` pattern); `locations_mode=full` only when adapter points at sibling and smoke passes. |
| **Out of scope v1 sibling** | Geo-assisted place pick, live inventory/pricing truth, mobile capture app, recipe shopping (design docs remain future). |

## 1) Why

ChatIQ’s core mission is multilingual chat, channels, and bot runtime. Locations needs long-running vision jobs, operator mapping UX, and place graphs. Keeping that in-process forced `locations_mode` quarantine and left extraction ~half-operable. Extract so trial-and-error on mapping cannot regress core chat.

## 2) Definition of Done (sibling v1)

### Phase 0 — Skeleton

- [x] Repo `chatiq-locations` created; `/api/health` (local)
- [x] Service-token auth helper; env contract in `.env.example`
- [x] Root `ROADMAP.md` + spec pack under `dev_docs/`
- [x] ChatIQ adapter stub (`chatiq/src/lib/locations-sibling`) — fail closed; zero calls when gated off
- [x] Commands execute stub + core SQL migration draft + Supabase client
- [ ] Dedicated Supabase project created + migration applied
- [ ] Vercel project + production deploy

### Phase 1 — Organic data + commands (deterministic, **manual first**)

- [x] `_locations_*` tables on shared booking Supabase
- [x] Commands/API: places, zones, publish, `map.resolve_item` (+ coverage / place map)
- [x] Smoke **without vision**: `npm run smoke:organic`
- [ ] Minimal operator UI for that path
- [ ] **Pilot DoD (manual):** allowlisted bot can answer “where is X?” from published sibling data

### Phase 2 — Operator extraction (salvage quality)

- [ ] Multi-image pipeline is staged + observable (1 / 3 / 8 image ladder green)
- [ ] Operator UI for upload → process → review JSON → publish
- [ ] Failures surface `failure_reason`; raw per-image payloads retained for recombine

### Phase 3 — ChatIQ concierge thin path

- [x] `locations_mode=full` + sibling env → ChatIQ uses sibling `places.list` + `map.resolve_item` (deterministic reply)
- [ ] In-process `locations-flow` / extraction paths demoted or deleted behind flag
- [ ] Pilot bot smoke: select place → “where is X?” from published sibling data (manual and/or extracted)

### Phase 4 — Strangler closeout

- [ ] Document cutover; stop writing location truth in ChatIQ
- [ ] Archive or soft-land legacy Locations dashboard routes that bypass sibling
- [ ] Roadmaps / `_active-focus` point only at sibling

## 3) Non-goals (this mission)

- Replacing the place/zone product design
- Building mobile zone-capture client
- Payments / checkout for retail
- Broad GTM with `locations_mode=full` before Phase 1 manual smoke (or Phase 2 ladder for vision-led pilots)
- Requiring complete floor plans before any shopper answer

## 4) Progress Log

### 2026-11-07 — ChatIQ legacy Locations archive fence

**What changed (in `chatiq`):** Soft-landed `/dashboard/locations/**`; removed sidebar entry; archived in-process docs under `dev_docs/item-location-knowledge/_archive/2026-legacy-inprocess/`; roadmaps/`_active-focus` point only at this sibling for product work.

**Next:** Operator UI / denser map coverage (e.g. Bangkapi peanut butter, cereal, flour gaps).

```text
chatiq: [####################] archive fence done
chatiq-locations: [###############_____] ~72% -> Operator UI / coverage
```

### 2026-11-06 — Villa bind + resolve matcher

**What changed:** Grocery bot unbound from Fuji/Gourmet (was answering Fuji “Paper Products” shelf); bound **Villa Market Thong Lo** only. Resolve matcher: whole-word tokens (scott≠scottish), generic last-token guard (`paper products`≠tomato products), aisle-first match rank, shelf `where` phrasing.

**Verified locally:** `toilet paper` → Aisle 6 + Household section; `paper products` hits paper goods not tomato/hair “products”; `Scott` no longer Scottish salmon.

**Next:** Commit/push → Vercel; chat smoke toilet paper / paper products → numbered aisles.

```text
chatiq-locations: [##############______] ~70% -> Live aisle smoke after deploy
```

### 2026-11-06 — ChatIQ sibling wire + Vercel

**What changed:** Production deploy health green. ChatIQ loads places from sibling when gated; item lookups call `map.resolve_item` and return aisle answers (skips in-process place concierge/recipe when sibling on).

**Next:** Create place for pilot bot_id via commands API; chat smoke with `locations_mode=full`.

```text
chatiq-locations: [############________] ~58% -> Pilot chat smoke
```

### 2026-11-05 — Phase 1 organic commands

**What changed:** Shared DB with `_locations_*` prefix applied; store + `executeLocationsCommand` for place/zone/items/publish/resolve; `npm run smoke:organic` green locally.

**Verified:** `/api/health` persistence=supabase; organic smoke place→zone→oat milk→publish→resolve.

```text
chatiq-locations: sibling v1: [##########__________] ~48% -> Operator UI / ChatIQ pilot wire-up next
```

### 2026-11-05 — Adapter stub + Supabase skeleton

**What changed:** ChatIQ `locations-sibling` adapter/env/tests; sibling `POST /api/v1/commands/execute` stub; Supabase admin client + health probe; core migration `places` / layouts / `zones` / `zone_items` / `zone_publications`; [`supabase-setup.md`](./supabase-setup.md).

**Verified:** locations adapter unit tests; sibling typecheck after install.

**Approx. toward DoD:**

```text
chatiq-locations: sibling v1: [######______________] ~28% -> Create Supabase project + apply migration
chatiq (adapter): locations sibling stub: [####################] 100% -> Phase 0 adapter
```

**Next:** Operator creates Supabase project; then Phase 1 command implementations.

### 2026-11-04 — Sibling folder scaffolded

**What changed:** Created `chatiq-locations/` Next.js app (port 3004), `GET /api/health`, `LOCATIONS_SERVICE_TOKEN` helper, root `ROADMAP.md`, copied spec pack into `dev_docs/`, `git init`.

**Verified:** `npm install`; `tsc --noEmit` clean.

**Approx. toward DoD:**

```text
chatiq-locations: sibling v1: [####________________] ~18% -> Phase 0 local; Vercel + ChatIQ adapter next
```

**Next:** Vercel project; ChatIQ adapter stub + allowlist.

### 2026-11-04 — Spec + roadmap pack

**What changed (docs):** Locked organic-mapping principles; salvage Keep/Adapt/Defer/Drop table; command-library draft (guest/staff/extract); phased `ROADMAP-locations-sibling.md`. Phase 1 explicitly **manual path before vision**.

**Verified:** Docs only; no sibling repo yet.

**Approx. toward DoD:** Spec ~done; Phase 0 still **0%** code.

```text
chatiq (docs): locations sibling spec: [####################] 100% -> Spec pack
chatiq-locations: sibling v1: [##__________________] ~8% -> Phase 0 scaffold next
```

**Next:** Scaffold `chatiq-locations` + `/api/health` + ChatIQ adapter stub + allowlist env.

### 2026-11-04 — Sibling decision locked

**What changed (docs):** Product decision: Locations becomes a **sibling app** (`chatiq-locations`), same strangler pattern as booking. In-process ChatIQ Locations remains quarantined; do not expand extraction in core. Mission + roadmap pointers added.

**Verified:** Decision recorded with operator (this session).

**Approx. toward DoD:** Phase 0 **0%** (repo not created).

```text
chatiq-locations: sibling v1: [____________________] 0% -> Phase 0 scaffold
```

**Next:** Create `chatiq-locations` repo + health endpoint; draft API contract v0; wire ChatIQ adapter stub + allowlist env.
