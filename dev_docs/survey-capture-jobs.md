# Photo sets + active zone (mapper)

Last updated: 2026-11-14  
Status: **Implemented** (album UX) — apply SQL migration if not already  
Parent: [`operator-input-and-hosting.md`](./operator-input-and-hosting.md)

## Mental model

1. **Active zone** — the aisle/section that receives Add / Replace & publish. Load from the zone list, or type + Save / Rename / Delete.
2. **Images** — one section for live photos and named **sets** (albums).  
   Buttons: Take photo · Add from library · Load set · Save set (· Save as…).  
   **Take photo** opens an in-page camera that stays up between shots. Each shutter press is added to the grid immediately (up to 24). **0.5 / 1 / 2** and pinch use the phone’s zoom when it reports those lenses, and the camera opens at **0.5** when that lens exists. If the browser cannot open a live camera, Take photo falls back to the system camera (one shot, then it closes).  
   Tap a thumbnail to view; **×** removes (confirm).  
   **Process photos** sends the photos already on the phone, one at a time, into Text/speak. The count and time remaining stay on screen.
3. Named sets are stored on the phone. The Supabase copy is paused until on-phone processing is solid. The old server extract queue is not the process path.

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
4. **Process photos** reads the phone photos and fills Text/speak. Keep the mapper open until the count finishes.  
5. Reopen a set from the phone list. Sets marked “on server” are older copies, including ones that never finished. **Delete set** removes them.  
6. Add & publish or Replace & publish  
