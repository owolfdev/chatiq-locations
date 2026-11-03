# Organic store mapping (product principles)

Last updated: 2026-11-04  
Status: **Locked for sibling v1**  
Mission: [`_mission-locations-sibling-v1.md`](./_mission-locations-sibling-v1.md)

## Promise

A **place** (store) can exist as soon as it is created — incomplete is fine. One or many agents fill in the picture over time at any grain: layout hints, whole aisles, or a single item. Shoppers only see **published** knowledge; drafts stay operator-side.

## Principles

1. **Place first.** Create the store/site before anything else. Empty place = valid.
2. **Any grain of input.** Allowed in any order:
   - layout metadata (e.g. approximate aisle count, notes)
   - a zone (“aisle 15”) with optional position / neighbor hints
   - full zone contents **or** one observed item
   - photos → extraction (later phase) as *assist*, not required for first publish
3. **Multi-agent additive.** Different people can own different zones or updates; prefer merge/append over wipe.
4. **Zone is the unit of mapping.** Aisle / section / endcap / cooler — same `zone` model (`zone_type` + `zone_label`).
5. **Draft vs published.** Pending review is editable; **publish** makes knowledge shopper-visible. Incomplete places still answer honestly: “not mapped yet.”
6. **Layout eras.** Material remodel → new `place_layout_version`; don’t pretend old zones are current.
7. **Concierge honesty.** Answers use latest published map for the selected place only; missing item → say so; optional “change store” later.
8. **Vision is optional acceleration.** Manual zone + item entry must work without photos (Phase 1). Extraction hardens in Phase 2.

## Examples (all valid)

| Action | Result |
|--------|--------|
| Create “Central Rama 9” | Place exists; chat can select it; map empty |
| Add zone aisle 15 + “near produce” | Zone draft; still unpublished |
| Add one item “oat milk” to aisle 15 + publish | Shopper: oat milk → aisle 15 |
| Later agent uploads 5 shelf photos for aisle 15 | Extraction proposes pending JSON; human publishes |
| Second agent adds aisle 16 | Store picture grows without touching aisle 15 |

## Non-goals (this principle set)

- Requiring a complete floor plan before any answer  
- Live ERP stock counts  
- Auto-publishing extraction without review  
- Geo “find nearest store” (deferred)
