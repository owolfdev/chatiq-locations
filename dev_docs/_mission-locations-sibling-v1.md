# Mission: Locations sibling v1 (`chatiq-locations`)

Last updated: 2026-11-14  
Status: **Sibling live** (pilots + concierge + vision draft + album mapper UX). Next: phone-smoke on-phone process and the foreground server copy.

Owner: Engineering

**Prior art:** organic mapping + archived ChatIQ Locations design.  
**Pattern:** same strangler as booking → [`../../chatiq-booking/dev_docs/_mission-booking-sibling-v1.md`](../../chatiq-booking/dev_docs/_mission-booking-sibling-v1.md).  
**Repo roadmap:** [`../ROADMAP.md`](../ROADMAP.md) · Workspace index: [`../../ROADMAP.md`](../../ROADMAP.md).

**Spec pack:**

| Doc | Role |
|-----|------|
| [`organic-mapping.md`](./organic-mapping.md) | Product principles — place first, any grain, multi-agent, draft vs publish |
| [`operator-input-and-hosting.md`](./operator-input-and-hosting.md) | **Locked 2026-11-07** — ChatIQ control plane vs sibling mapper; source-agnostic ingest |
| [`locations-salvage.md`](./locations-salvage.md) | Keep / Adapt / Defer / Drop from in-`chatiq` work |
| [`locations-command-library.md`](./locations-command-library.md) | Concierge + staff + extract command contract draft |
| [`../ROADMAP.md`](../ROADMAP.md) | Phased plan + progress snapshot |

## Resume here (next session)

**Next action (2026-11-13):** Phone-smoke the field-day mapper: install the PWA, sign in with a ChatIQ account, pick a store, switch to the next store. Server extract smoke is still open (Process, leave, reopen, draft in Text/speak). Spec: [`operator-input-and-hosting.md`](./operator-input-and-hosting.md) field day, [`survey-capture-jobs.md`](./survey-capture-jobs.md).

ChatIQ env: `LOCATIONS_RUNTIME=sibling`, URL, token (Open mapper passes `access_token`). Sibling: `OPENAI_API_KEY`, same service/mapper token.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| **Shape** | Sibling Next.js app **`chatiq-locations/`** (own git + Vercel). |
| **Why sibling** | Mapping + vision + publish must not ride ChatIQ deploys. |
| **Organic mapping** | Place first; any grain; multi-agent; publish gates shopper answers. [`organic-mapping.md`](./organic-mapping.md). |
| **Hosting split** | **ChatIQ** = `locations_mode` + **one bound place** + launch mapper. **Sibling** = mapper UI + ingest/vision/publish engines. [`operator-input-and-hosting.md`](./operator-input-and-hosting.md). |
| **One bot ↔ one place** | No multi-store picker in shopper chat. |
| **Field day** | Mapper is a PWA. Sign-in uses the ChatIQ account via API and a signed team pass. Home screen lists that team’s stores. Picking a store does not rebind a bot. |
| **Source-agnostic ingest** | Image / voice / spreadsheet / chat → text → LLM normalize → draft → publish. |
| **LLM normalize** | Required for freeform; deterministic sibling applies typed patches only; no auto-publish. |
| **Mapper UX** | Active zone (load/save/rename/delete) + Images (named photo sets + live Process) + text/speak + compass. |
| **Photos** | Ephemeral evidence; durable SoT is text + pose metadata (+ optional thumbnail). |
| **Source of truth** | Sibling `_locations_*` DB; no dual-write forever. |
| **Legacy in-`chatiq`** | Dashboard UI archived 2026-11-07; in-process libs quarantined. |
| **Out of scope v1** | Geo nearest-store, AR measure, native App Store client, live ERP stock. Phone client is the PWA. |

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
- [x] ChatIQ bound-place picker + Open mapper link
- [x] Sibling mapper shell (text/image/compass) + heuristic normalize → draft (LLM normalize later)
- [x] **Pilot DoD (manual):** allowlisted bots answer “where is X?” (Villa + Gourmet Bangkapi)

### Phase 2 — Operator extraction (salvage quality)

- [x] Multi-image pipeline staged + observable (capture sets + extract jobs + cron tick)
- [x] Mapper camera batch → draft → review → publish (OpenAI vision → Text/speak; no auto-publish)
- [x] Failures surface `failure_reason`; photos in Storage with TTL cleanup

### Phase 3 — ChatIQ concierge thin path

- [x] `locations_mode=full` + sibling → LLM concierge + `map.resolve_item`
- [ ] In-process `locations-flow` / extraction demoted or deleted behind flag
- [x] Pilot chat smoke (Villa + Bangkapi)

### Phase 4 — Strangler closeout

- [x] Soft-land legacy `/dashboard/locations` (2026-11-07)
- [x] Roadmaps / `_active-focus` point at sibling
- [ ] Stop any remaining ChatIQ writes to location truth; optional delete in-process libs

## 3) Non-goals (this mission)

- Replacing the place/zone product design
- Native App Store capture client (mobile web first)
- AR measuring / CAD floor plans
- Payments / checkout for retail
- Requiring complete floor plans before any shopper answer

## 4) Progress Log

### 2026-11-14 — Process from the phone again

**What changed:** Process sends the photos already on the phone, one at a time, with a live count and time left. Named sets are stored on the phone. A Supabase copy uploads only while the mapper is open and pauses when the phone is locked or left. The server extract queue is no longer the process path.

**Next:** Phone-smoke: process a set with the screen open, confirm the draft, then confirm the server copy pauses when the app is backgrounded.

```text
chatiq-locations: [###################_] ~96% -> Phone-smoke on-phone process + foreground copy
```

### 2026-11-13 — Field-day mapper (PWA, ChatIQ login, store list)

**What changed:** Spec in [`operator-input-and-hosting.md`](./operator-input-and-hosting.md). Mapper home screen is a PWA. Sign-in posts to ChatIQ `POST /api/locations/mapper-session`, which checks the existing password and returns a 14-day signed pass with `team_id`. The home dropdown lists that team’s stores. The aisle screen can switch stores. Bot binding stays in ChatIQ settings. When `MAPPER_SESSION_SECRET` is set, map actions and survey calls are limited to that team. The shared mapper token still works for the old Open mapper link.

**Next:** Set the same secret on both Vercel projects, set `CHATIQ_BASE_URL` on locations, then phone-smoke sign-in and store switch.

```text
chatiq-locations: [###################_] ~96% -> Phone-smoke field-day login + server extract
chatiq: mapper-session API shipped locally
```

### 2026-11-12 — Server extract chain

**What changed:** Process uploads the photo set and queues extract. Each Vercel run takes several photos, then starts the next run. A stale "running" photo is retried. Reopening the mapper loads the unpublished draft into Text/speak. Retry extract re-runs a failed set. Spec: [`survey-capture-jobs.md`](./survey-capture-jobs.md).

**Next:** Phone-smoke: upload, leave the page, come back to the draft.

```text
chatiq-locations: [####################] ~96% -> Phone-smoke server extract
```

### 2026-11-12 — In-page aisle camera

**What changed:** Take photo opens a viewfinder that stays up. Each shutter press lands in the Images grid with no Use image step, up to 24. Lens buttons 0.5 / 1 / 2 plus pinch; opens at 0.5 when the phone reports that zoom. System camera remains the fallback. Spec: [`survey-capture-jobs.md`](./survey-capture-jobs.md).

**Next:** Phone-smoke an aisle walk: rapid shots, 0.5 start, pinch, Done, then Process.

```text
chatiq-locations: [####################] ~96% -> Phone-smoke continuous camera
```

### 2026-11-10 — Album Images + Active zone mapper UX

**What changed:** Replaced dual Camera/Survey mental model with one **Images** card (take/library/load set/save set, per-photo × + detail, Process live). **Sticky zone** → **Active zone** with save/rename/delete + load from list. Zone rename/delete store APIs; set download URLs + delete asset/set. Spec: [`survey-capture-jobs.md`](./survey-capture-jobs.md).

**Next:** Deploy; phone-smoke load/save set → Process → publish; rename zone.

```text
chatiq-locations: [####################] ~96% -> Deploy album UX smoke
```

### 2026-11-09 — Survey capture sets + background extract

**What changed:** Capture sets / assets / extract jobs tables + `locations-capture` bucket; signed upload APIs; mapper Survey UI; cron `/api/cron/extract-tick`; draft → Use draft → Add/Replace; ChatIQ Open mapper passes `access_token`. Spec: [`survey-capture-jobs.md`](./survey-capture-jobs.md).

**Next:** Apply SQL migration on Supabase; deploy both apps; smoke aisle walk → desktop queue.

```text
chatiq-locations: [###################_] ~94% -> Migration apply + LLM normalize
```

### 2026-11-09 — Multi-photo Process: compress + sequential API

**What changed:** Multi-image Server Action uploads were crashing the mapper page on Vercel (body/timeout). Client now compresses shots, POSTs `/api/map/process-photos` one image at a time (`maxDuration` 60), merges drafts locally. Queue cap raised to **12** (aisle walks); not a platform memory hard limit.

**Next:** Deploy; phone-smoke 2–3 shelf shots.

```text
chatiq-locations: [##################__] ~92% -> Deploy multi-photo fix
```

### 2026-11-09 — Matcher: brand + category fillers (Ruffles)

**What changed:** `map.resolve_item` no longer requires filler words like `potato` when the query ends in an ambiguous noun (`chips`). Brand-led queries (`ruffles potato chips`) match `Ruffles Original` / variants; peanut-butter guard still holds.

**Next:** Deploy sibling; re-ask Gourmet Bangkapi chat for Ruffles.

```text
chatiq-locations: [##################__] ~91% -> Deploy matcher fix + vision smoke
```

### 2026-11-08 — Vision extract → Text/speak draft

**What changed:** Ported OpenAI vision into sibling (`src/lib/vision/*`); `processMapperPhotos` FormData action; mapper **Process photos** fills editable Text/speak draft (Add/Replace unchanged). `OPENAI_API_KEY` / optional `LOCATIONS_VISION_MODEL` in `.env.example`; server action body limit 24mb.

**Next:** Set key on Vercel + deploy; phone smoke; then job telemetry or LLM normalize.

```text
chatiq-locations: [##################__] ~90% -> Deploy vision + telemetry / LLM normalize
```

### 2026-11-07 — Zone item add / remove / replace + vision next-doc

**What changed:** Mapper Add / Remove / Clear all / Replace-all text mode; [`vision-extract-next.md`](./vision-extract-next.md) locked (OpenAI port from archived extract, draft → Text/speak).

**Next:** Implement vision extract per that doc.

```text
chatiq-locations: [#################___] ~86% -> Vision extract
```

### 2026-11-07 — Mapper shell v1 (text / speak / compass)

**What changed:** `/map?place_id=` phone UI — sticky zone, text+speak ingest (heuristic normalize → upsert items → publish), compass/GPS readout, zone list + inspect/add item, photo batch queue (vision TBD).

**Next:** Deploy; LLM normalize; vision extract on photo batch; mapper auth/handoff.

```text
chatiq-locations: [#################___] ~85% -> Vision + LLM normalize
```

### 2026-11-07 — Bound-place picker + mapper handoff

**What changed:** Sibling commands `places.list_for_team` + `place.bind_bot`; ChatIQ bot Settings bound-place dropdown + Open store mapper → `/map?place_id=`; sibling `/map` placeholder page.

**Next:** Real mapper shell (text/camera/compass) + deploy both apps.

```text
chatiq: [##################__] control plane picker shipped (needs deploy)
chatiq-locations: [################____] ~78% -> Mapper shell
```

### 2026-11-07 — Operator input + hosting split locked

**What changed (docs):** [`operator-input-and-hosting.md`](./operator-input-and-hosting.md) — ChatIQ control plane (mode + bound place + Open mapper) vs sibling mapper (text/image/compass, source-agnostic ingest, LLM normalize, ephemeral photos). Roadmap Phase 1b added.

**Next:** Build bound-place picker in ChatIQ; scaffold sibling mapper shell.

```text
chatiq-locations: [###############_____] ~72% -> Bound-place picker + mapper shell
```

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
