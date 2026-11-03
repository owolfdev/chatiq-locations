# chatiq-locations

Sibling Next.js app for **item location knowledge**: places, layout versions, zones, publish, and (later) vision extraction.

ChatIQ stays a thin HTTP adapter gated by `locations_mode`. This repo owns mapping truth and operator extract/publish UX.

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev   # http://localhost:3004
```

- Health: [http://localhost:3004/api/health](http://localhost:3004/api/health)
- Roadmap: [`ROADMAP.md`](./ROADMAP.md)
- Mission: [`dev_docs/_mission-locations-sibling-v1.md`](./dev_docs/_mission-locations-sibling-v1.md)

## Auth

`LOCATIONS_SERVICE_TOKEN` — Bearer on `/api/v1/*` (commands not wired yet). Health is open.

## Pattern

Same strangler as [`../chatiq-booking`](../chatiq-booking): own git, Vercel, optional dedicated Supabase.
