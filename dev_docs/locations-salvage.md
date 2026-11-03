# Locations salvage table (sibling cutover)

Last updated: 2026-11-04  
Source of truth for product model: [`item-location-knowledge-design.md`](./item-location-knowledge-design.md)  
Organic rules: [`organic-mapping.md`](./organic-mapping.md)

Legend: **Keep** = reuse as-is · **Adapt** = move/reshape in sibling · **Defer** = not sibling v1 · **Drop** = do not port into sibling runtime

## Product model

| Piece | Verdict | Notes |
|-------|---------|--------|
| Terms: place / layout version / zone / zone_scan / publication | **Keep** | Schema naming; UI says “Locations” |
| Place → layout → zone → publish → place-scoped answers | **Keep** | Core loop |
| Organic incomplete maps | **Keep** | Codified in `organic-mapping.md` |
| `bot_documents` as retrieval layer | **Adapt** | Sibling owns publish payload; ChatIQ retrieves via adapter or published docs hook |
| Mode-aware extraction (`product` / `store` / `facility` / `mixed`) | **Adapt** | Sibling extraction service; operator-visible prompt preview |
| Recipe → ingredients → place resolve | **Defer** | Nice after item-location path is solid |
| Geo place selection | **Defer** | Explicit non-goal |
| Live inventory / pricing truth | **Defer** | Location guidance ≠ stock |

## Data (ChatIQ → sibling)

| Piece | Verdict | Notes |
|-------|---------|--------|
| `places`, `place_layout_versions`, `zones` | **Adapt** | Migrate or cutover; sibling DB SoT |
| Zone description / neighbors / position hints | **Keep** | Supports organic layout notes |
| `zone_scans`, observations, pending JSON | **Adapt** | Jobs + telemetry live in sibling |
| Publications / place map snapshots | **Adapt** | Concierge reads sibling publications |
| Dual-write forever | **Drop** | Strangle; ChatIQ stops owning truth |

## Operator UX

| Piece | Verdict | Notes |
|-------|---------|--------|
| Locations dashboard (list places, zones, publish) | **Adapt** | Rebuild in sibling-first; ChatIQ thin UI optional later |
| Manual place pick + stale reconfirm | **Keep** | Concierge still needs place context lifecycle |
| Raw JSON review before publish | **Keep** (v1) | Field-level review UI later |
| Multi-image upload extract | **Adapt** | Staged pipeline + progress; fix black box here |
| Guided photo protocol polish | **Defer** | After 1/3/8 ladder green |

## Chat / runtime

| Piece | Verdict | Notes |
|-------|---------|--------|
| `locations_mode` off / shadow / full | **Keep** | Gate + allowlist bots |
| In-process extraction in `handleChatRequest` | **Drop** | Quarantine → delete after Phase 3 |
| Place-aware item / aisle answers | **Adapt** | LLM interprets; sibling returns structured map |
| Deterministic missing-item honesty | **Keep** | Part of organic promise |

## Infra pattern (from booking)

| Piece | Verdict | Notes |
|-------|---------|--------|
| Own Next.js repo + Vercel | **Keep** | `chatiq-locations` |
| Service-token HTTP API | **Keep** | Mirror booking adapter |
| Dedicated Supabase when ready | **Keep** | Prefer clear SoT over shared messy DB |
| Allowlist bot IDs | **Keep** | Rollout control |

## Explicitly do not salvage into sibling v1

- Expanding in-`chatiq` vision jobs “one more time”
- Shipping `locations_mode=full` before Phase 2 extract ladder (or Phase 1 manual publish path for pilot)
- Redesigning place/zone vocabulary
