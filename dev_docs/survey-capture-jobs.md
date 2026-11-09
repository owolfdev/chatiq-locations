# Survey capture sets + background extract

Last updated: 2026-11-09  
Status: **Implemented** — apply SQL migration + deploy before use  
Parent: [`operator-input-and-hosting.md`](./operator-input-and-hosting.md) · Roadmap Phase 2

## Goal

Walk the store aisle-by-aisle with internet: each sticky zone gets a **capture set** of compressed photos in Supabase Storage. Later (phone or desktop), enqueue **extract jobs**; a cron/worker processes one image at a time into a **draft** for Add/Replace. No auto-publish. No relying on phone RAM or an open tab for the full store.

## Auth

Mapper survey/upload APIs require `Authorization: Bearer <LOCATIONS_MAPPER_TOKEN>` (falls back to `LOCATIONS_SERVICE_TOKEN`). Open mapper with `?place_id=…&access_token=…` (token stored in `sessionStorage` for the tab). Cron worker uses `Authorization: Bearer <CRON_SECRET>` or `LOCATIONS_SERVICE_TOKEN`.

## Tables

| Table | Role |
|-------|------|
| `_locations_capture_sets` | One set per aisle walk segment |
| `_locations_capture_assets` | Storage object refs + per-image extract status |
| `_locations_extract_jobs` | Queue + progress + `draft_text` / `result_json` |

## Storage

- Bucket: `locations-capture` (private)
- Path: `{team_id}/{place_id}/{set_id}/{asset_id}.jpg`
- TTL cleanup: delete objects after success retain (7d) or failed retain (14d)

## Flow

1. Create/open set for sticky zone  
2. Compress on device → signed PUT → register asset  
3. Close set (`ready`) when moving to next aisle  
4. Enqueue extract job(s)  
5. `/api/cron/extract-tick` claims one pending asset, vision extract, updates progress  
6. When complete → `draft_ready`; operator loads draft → Add/Replace  

## Caps

- Max **24** assets per set  
- Compress ~1600px edge before upload  
