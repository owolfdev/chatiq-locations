# Supabase setup — `chatiq-locations`

**Shared project with booking** (same URL/keys as `chatiq-booking`). Locations tables use a `_locations_` prefix so they sort together and stay visually isolated from booking tables in the dashboard.

Storage buckets (when added): `_locations_*` or `locations-*` — same isolation idea.

## Naming

| Logical | Physical table |
|---------|----------------|
| places | `_locations_places` |
| place ↔ bot | `_locations_place_bots` |
| layout versions | `_locations_place_layout_versions` |
| zones | `_locations_zones` |
| zone items | `_locations_zone_items` |
| publications | `_locations_zone_publications` |
| capture sets | `_locations_capture_sets` |
| capture assets | `_locations_capture_assets` |
| extract jobs | `_locations_extract_jobs` |
| storage bucket | `locations-capture` (private) |

App code should use [`src/lib/supabase/tables.ts`](../src/lib/supabase/tables.ts) — not bare strings.

Survey capture: see [`survey-capture-jobs.md`](./survey-capture-jobs.md). Also apply:

[`../supabase/migrations/20261109000000_locations_capture_jobs.sql`](../supabase/migrations/20261109000000_locations_capture_jobs.sql)

Booking tables stay unprefixed for now (live schema). No rename required.

## 1. Env (local + Vercel)

Reuse booking project credentials in `.env.local` (same as `chatiq-booking`):

| Env | Value |
|-----|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Booking project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable / anon key |
| `SUPABASE_SECRET_KEY` | Service role / secret key |
| `LOCATIONS_SERVICE_TOKEN` | Shared with ChatIQ `LOCATIONS_SIBLING_TOKEN` |

## 2. Apply migration

SQL Editor → run:

[`../supabase/migrations/20261105000000_locations_core_v0.sql`](../supabase/migrations/20261105000000_locations_core_v0.sql)

Then survey jobs:

[`../supabase/migrations/20261109000000_locations_capture_jobs.sql`](../supabase/migrations/20261109000000_locations_capture_jobs.sql)

Safe on a DB that already has booking tables — only creates `_locations_*` (+ `locations-capture` bucket).

If you already ran an older unprefixed draft (`places`, `zones`, …), drop those empty tables first or skip — this migration uses the prefixed names only.

## Import legacy ChatIQ maps

One-shot copy of published places/zones/items from ChatIQ `bot_*` tables into `_locations_*`:

```bash
# from chatiq-locations/
npm run import:chatiq -- --dry-run
npm run import:chatiq
```

Requires `../chatiq/.env.local` (source) and `./.env.local` (dest). Preserves UUIDs. Re-runnable (upsert).

## 3. Verify

```bash
npm run dev
curl -s http://localhost:3004/api/health
```

Expect `"persistence":"supabase"` and `supabase.reachable: true`.
