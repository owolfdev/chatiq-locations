# Gourmet Market Bangkapi — isolated examination pack

Exported: 2026-11-06T22:09:55.640Z

## Bot (ChatIQ)

| Field | Value |
|------|-------|
| id | `32e70428-944c-4f83-a8a0-b622c75b6af7` |
| name | Gourmet Market Bangkapi Shopping Assistant |
| slug | `gourmet-market-bangkapi-assistant` |
| locations_mode | `full` |
| team_id | `6eb8602b-b5d7-4544-94b1-429443242378` |
| chat path | `/chat/gourmet-market-bangkapi-assistant` |

## Place (chatiq-locations)

| Field | Value |
|------|-------|
| id | `07ddb30a-09d6-4254-8dc1-be10597403fc` |
| name | Gourmet Market The Mall Lifestore Bangkapi |
| address | 3522 Lat Phrao Rd, Khlong Chan, Bang Kapi, Bangkok. |
| primary_bot_id | `32e70428-944c-4f83-a8a0-b622c75b6af7` |
| is_active | true |

## Coverage

- Zones: **8**
- Published zones: **8**
- Items in draft zone tables: **1124**
- Items in published snapshots (what resolve uses): **1124**

### Published zones

- **aisle Aisle 1** — 67 items (near: Makeup section)
- **aisle Aisle 2** — 129 items
- **aisle Aisle 3** — 242 items
- **aisle Aisle 24** — 138 items
- **section Packed Sausage** — 30 items (near: Cheese and Butter, Packed Meats)
- **section Cheese and Butter** — 31 items (near: packed sausage, cold drinks section)
- **section Packed Meat** — 91 items (near: packed sausage)
- **section Fresh Vegetables Section** — 396 items (near: produce section)

## Files in this folder

- `README.md` — this summary
- `bundle.json` — full bot/place/zones/items/publications dump
- `published-item-index.json` — flat sorted list of published item names (for grep)

## Resolve smoke (expected)

**Not on map:** peanut butter, cereal, flour → empty matches (honest “ask staff”).

**On map examples:** cheese, sausage, packed meat, vegetables / aisle labels.
