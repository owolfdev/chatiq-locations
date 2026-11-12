# Photo sets + active zone (mapper)

Last updated: 2026-11-12  
Status: **Implemented** (album UX) — apply SQL migration if not already  
Parent: [`operator-input-and-hosting.md`](./operator-input-and-hosting.md)

## Mental model

1. **Active zone** — the aisle/section that receives Add / Replace & publish. Load from the zone list, or type + Save / Rename / Delete.
2. **Images** — one section for live photos and named **sets** (albums).  
   Buttons: Take photo · Add from library · Load set · Save set (· Save as…).  
   **Take photo** opens an in-page camera that stays up between shots. Each shutter press is added to the grid immediately (up to 24). **0.5 / 1 / 2** and pinch use the phone’s zoom when it reports those lenses, and the camera opens at **0.5** when that lens exists. If the browser cannot open a live camera, Take photo falls back to the system camera (one shot, then it closes).  
   Tap a thumbnail to view; **×** removes (confirm).  
   **Process photos** runs vision live into Text/speak for the active zone — same path whether the grid was shot now or loaded from a set.
3. Sets are **named bags of photos** in Storage. **Process photos** queues a server extract. A Vercel run handles a few photos, then starts the next run until the draft is saved. The once-a-minute cron resumes a chain that stopped.

## Auth

Mapper set upload/load APIs require `Authorization: Bearer <LOCATIONS_MAPPER_TOKEN>` (falls back to `LOCATIONS_SERVICE_TOKEN`). Open mapper with `?place_id=…&access_token=…` (token in `sessionStorage`).

## Tables

| Table | Role |
|-------|------|
| `_locations_capture_sets` | Named album (`zone_label` = name, `zone_type` often `album`) |
| `_locations_capture_assets` | Storage object refs |
| `_locations_extract_jobs` | Legacy background queue (optional) |

## Storage

- Bucket: `locations-capture` (private)
- Path: `{team_id}/{place_id}/{set_id}/{asset_id}.jpg`
- Cap: **24** assets per set · Process UI cap: **24** (`MAX_PROCESS_PHOTOS`)

## Flow

1. Set / load **active zone**  
2. Take / library / load set into the Images grid  
3. Optional: Save set / Save as…  
4. **Process photos** uploads the set, then a Vercel chain extracts a few photos per run until the draft is saved. The phone can be pocketed after the upload finishes.  
5. Reopen the mapper: the unpublished draft loads into Text/speak for that zone. **Retry extract** re-runs a failed set from the saved photos.  
6. Add & publish or Replace & publish  
