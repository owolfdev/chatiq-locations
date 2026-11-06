# Operator input + hosting split (locked)

Last updated: 2026-11-07  
Status: **Locked**  
Mission: [`_mission-locations-sibling-v1.md`](./_mission-locations-sibling-v1.md)  
Principles: [`organic-mapping.md`](./organic-mapping.md)

## Hosting split (ChatIQ vs sibling)

Same spirit as booking: **decisions in ChatIQ, heavy work in the sibling.**

| Surface | Lives in | Notes |
|---------|----------|--------|
| `locations_mode` (`off` / `shadow` / `full`) | **ChatIQ** bot settings | Already exists |
| **Bound place** picker (one place per bot) | **ChatIQ** (settings or Locations tab) | **Not built yet** — required control plane |
| “Open store mapper” launch link | **ChatIQ** → deep-link / handoff into sibling | Auth/team/place context |
| Mapper UI (text/speak, camera, compass, zone inspect) | **`chatiq-locations`** | Mobile-first; ChatIQ-like simplicity |
| Vision / normalize / merge / publish engines | **`chatiq-locations`** | No extraction runtime in ChatIQ |
| Shopper “where is X?” | **ChatIQ** chat via `locations-sibling` adapter | LLM concierge → deterministic commands |

**Do not** rebuild the full capture/extract UI inside ChatIQ (archived `/dashboard/locations` was the wrong place for that complexity).

**Auth:** humans need team identity. Prefer shared Supabase session **or** ChatIQ→sibling handoff token. Service token remains server→server only.

## One bot ↔ one place

Efficient default: each ChatIQ bot binds **exactly one** place (`primary_bot_id` / `_locations_place_bots`). No multi-store picker in shopper chat. Changing stores = rebind in ChatIQ control plane.

## Source-agnostic ingest

Every channel feeds one bus:

```text
source → text (or structured text) → LLM normalize → draft patch → review/approve → publish
```

| Source | Path into bus |
|--------|----------------|
| Text / speak | STT optional → text |
| One or many photos | Vision → text/JSON candidates |
| Spreadsheet / ERP export | Rows → text or semi-structured |
| Layout chat (“north end near frozen”) | Text + device pose |

Sibling applies **typed patches** only (`zone.upsert`, item merge, `zone.publish`, etc.). Users never fight schema.

## LLM normalize (required for freeform)

All freeform text passes an LLM step that:

1. Identifies intent (layout note vs zone contents vs single item add)
2. Canonicalizes zone identity
3. Emits a draft patch for the deterministic store

Guardrails: **draft-only** (no auto-publish); cheap model + strict JSON; confidence / needs-human when zone unbound.

### Zone canonicalization examples

| User says | Canonical zone |
|-----------|----------------|
| aisle 9, isle 9, section 9, 9 (aisle context) | `aisle` / `9` |
| frozen foods, frozen section, frozen food, frozen zone | `section` / `Frozen foods` |

Ambiguity → confirm in UI, don’t silently invent a second zone.

## Mapper UI (sibling) — simplicity bar

One primary screen for phone walkers:

- **Text / speak** input
- **Image** input (one or many → process as one batch)
- **Compass** readout (live heading) so operators can say “extreme north end…”
- **Coordinates** readout when available (accuracy if known); **never block** capture if missing
- Sticky **zone context** + **inspect zone** → see inventory → add one item quickly

### Capture patterns (all valid)

1. Type/speak: “this is aisle 9. cereal, peanut butter, …”  
2. Set sticky zone “aisle 9” → snap one or more shelves → batch process  
3. Open Frozen foods → add a single SKU  

### Layout / relative position (light, not CAD)

- Optional **walk the spine**: mark aisle 1, 2, 3… in order + pose samples → relative graph  
- Chat + visible compass for “far / north / near frozen”  
- **Defer** AR measuring / exact meters — overkill for v1 “where is X?”

### Photos vs knowledge storage

| Keep | Policy |
|------|--------|
| Extracted text / pending JSON / published snapshots | Durable SoT |
| Pose metadata (heading, lat/lng, accuracy, time) | Keep with draft/scan |
| Full-res photos | Ephemeral — short TTL or retain only on failed/low-confidence jobs |
| Thumbnail | Optional, for operator trust |

Re-shoot beats archiving every pass.

## ChatIQ control plane (next build)

1. Bot settings: keep `locations_mode`  
2. **Bound place** dropdown of team places → write sibling bind (`primary_bot_id` + `place_bots`)  
3. Link **Open store mapper** → sibling with place/team context  

## Out of scope here

Geo “find nearest store” · live ERP stock truth · field-level review chrome · native App Store client (mobile web first)
