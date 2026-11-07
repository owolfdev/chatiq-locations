# chatiq-locations

Sibling Next.js app for **item location knowledge**: places, layout versions, zones, publish, and mapper vision extract (OpenAI → Text/speak draft).

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

`LOCATIONS_SERVICE_TOKEN` — Bearer on `/api/v1/*`. Health is open.

## Supabase

Dedicated project required for Phase 1. Setup: [`dev_docs/supabase-setup.md`](./dev_docs/supabase-setup.md). Migration: `supabase/migrations/20261105000000_locations_core_v0.sql`.

## Pattern

Same strangler as [`../chatiq-booking`](../chatiq-booking): own git, Vercel, dedicated Supabase.
