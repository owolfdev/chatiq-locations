# Photo sets + active zone (mapper)

Last updated: 2026-11-10  
Status: **Implemented** (album UX) — apply SQL migration if not already  
Parent: [`operator-input-and-hosting.md`](./operator-input-and-hosting.md)

## Mental model

1. **Active zone** — the aisle/section that receives Add / Replace & publish. Load from the zone list, or type + Save / Rename / Delete.
2. **Images** — one section for live photos and named **sets** (albums).  
   Buttons: Take photo · Add from library · Load set · Save set (· Save as…).  
   Tap a thumbnail to view; **×** removes (confirm).  
   **Process photos** runs vision live into Text/speak for the active zone — same path whether the grid was shot now or loaded from a set.
3. Sets are **named bags of photos** in Storage. They are not auto-processed in the background in the current UI (legacy extract-job APIs/cron remain for optional reuse).

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
4. **Process photos** → draft in Text/speak  
5. Add & publish or Replace & publish  
