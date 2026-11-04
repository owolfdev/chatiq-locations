# Supabase setup — `chatiq-locations`

Dedicated project (do **not** reuse ChatIQ or booking Supabase).

## 1. Create project

1. [Supabase dashboard](https://supabase.com/dashboard) → New project (e.g. `chatiq-locations`).
2. Region: prefer same as ChatIQ/booking for latency.
3. Save DB password in your password manager.

## 2. Apply migration

SQL Editor → paste / run:

[`../supabase/migrations/20261105000000_locations_core_v0.sql`](../supabase/migrations/20261105000000_locations_core_v0.sql)

Or with CLI (once linked):

```bash
npx supabase db push
```

## 3. Env (local + Vercel)

From Project Settings → API:

| Env | Value |
|-----|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable / anon key |
| `SUPABASE_SECRET_KEY` | Service role / secret key |
| `LOCATIONS_SERVICE_TOKEN` | Shared with ChatIQ `LOCATIONS_SIBLING_TOKEN` |

Copy [`.env.example`](../.env.example) → `.env.local`.

## 4. Verify

```bash
npm run dev
curl -s http://localhost:3004/api/health
```

Expect `"persistence":"supabase"` and `supabase.reachable: true` once migration is applied.
