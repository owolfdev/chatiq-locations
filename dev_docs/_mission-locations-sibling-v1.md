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

**Next action (2026-11-04):** Create Vercel project for this repo; wire ChatIQ adapter stub + allowlist env (fail closed; zero calls when `locations_mode=off`). Then Phase 1 organic commands.

Treat `locations_mode=full` as pilot-only / broken-glass until adapter + smoke.

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
- [ ] Vercel project + production deploy
- [ ] ChatIQ adapter stub: fail closed when misconfigured; zero calls when `locations_mode=off`

### Phase 1 — Organic data + commands (deterministic, **manual first**)

- [ ] Migrate or re-home canonical tables (places, zones, scans, publications) into sibling Supabase (or clear cutover plan from ChatIQ Postgres)
- [ ] Commands/API per [`locations-command-library.md`](./locations-command-library.md): places, zones, publish, `map.resolve_item` (extract jobs can stub)
- [ ] Smoke **without vision**: create place → zone → one item → publish → resolve
- [ ] Minimal operator UI for that path
- [ ] **Pilot DoD (manual):** allowlisted bot can answer “where is X?” from published sibling data

### Phase 2 — Operator extraction (salvage quality)

- [ ] Multi-image pipeline is staged + observable (1 / 3 / 8 image ladder green)
- [ ] Operator UI for upload → process → review JSON → publish
- [ ] Failures surface `failure_reason`; raw per-image payloads retained for recombine

### Phase 3 — ChatIQ concierge thin path

- [ ] `locations_mode=full` + allowlist → ChatIQ calls sibling for place map / item-zone answers (LLM interprets; sibling returns structured place knowledge)
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
