# Vision extract — next session handoff

Last updated: 2026-11-08  
Status: **Shipped (local)** — deploy + set `OPENAI_API_KEY` on Vercel to use in prod  
Parent: [`operator-input-and-hosting.md`](./operator-input-and-hosting.md) · Roadmap Phase 2

## Goal

Mapper **Process photos** runs real vision extract and drops editable draft text into **Text / speak**. Operator chooses **Add to zone** or **Replace all items**, then publish. No auto-publish from vision.

## Provider (locked)

| Choice | Detail |
|--------|--------|
| **OpenAI** | Same as archived ChatIQ path — `gpt-5-mini` vision |
| **Not first** | Google Cloud Vision / Document AI (optional later for cheap OCR assist) |
| **Salvage** | Port/adapt [`../../chatiq/src/lib/locations/extract-zone-scan.ts`](../../chatiq/src/lib/locations/extract-zone-scan.ts) + [`extraction-mode.ts`](../../chatiq/src/lib/locations/extraction-mode.ts) |

Why OpenAI first: prompts + merge already worked for multi-image shelf runs; sibling isolation fixes the old ChatIQ timeout/black-box ops problem.

## Env

Add to `chatiq-locations` (local + Vercel):

```bash
OPENAI_API_KEY=...
# optional pin
LOCATIONS_VISION_MODEL=gpt-5-mini
```

## Implementation (2026-11-08)

1. ✅ `src/lib/vision/extraction-mode.ts` + `extract-zone-images.ts` — OpenAI `gpt-5-mini` single-image + merge; data URLs from FormData (no CDN).
2. ✅ Server action `processMapperPhotos` — FormData photos + sticky zone → `{ draftText, item_count, failures }` (no publish).
3. ✅ Mapper client: **Process photos** → fills Text/speak → operator edits → Add/Replace.
4. Later: `extract.job_*` staging + progress UI + ephemeral photo TTL.

## Draft text format

Prefer something the heuristic normalize already understands:

```text
aisle 9. Scott toilet paper, cereal, peanut butter
```

or sticky zone set + item list only. LLM normalize can replace heuristic later.

## Explicitly out of this slice

- Auto-publish from vision  
- Full job queue telemetry (follow-up)  
- Google project setup  
- Mapper auth/handoff hardening  

## Done when

- Phone: take 1–3 shelf photos → Process → draft appears in Text/speak  
- Add or Replace publishes; shopper chat can resolve a new item  
- Failures surface a readable message (no silent hang)
