# RaiseScout

A founder points it at a list of target investors. For each one it:

1. **Researches** the investor from public business sources (Claude + the web search tool).
2. **Scores fit** against *this specific raise* across six weighted dimensions — **every sub-score cites its evidence and source URL**.
3. Flags **conflicts** (e.g. has backed a direct competitor).
4. Drafts a **personalised first-touch** grounded in a real found fact.

The founder reviews everything. **The tool drafts, it never sends.**

> v0 = the "hero loop": paste a raise profile + investor names → a ranked, scored, evidence-cited shortlist with draft intros, in an expandable table, persisted to Postgres.

## Stack

- **Next.js** (App Router) + **Tailwind** — UI on a persistent Node server.
- **Supabase** (Postgres) — persistence; RLS on, all access via the service-role key server-side.
- **Claude API** with the **web search** server tool — the research-and-score agent.

## The scoring model

Six dimensions, each `{ score 0–5, confidence, evidence, source_url }`. Weighted to /100:

| Dimension | Weight |
|---|---|
| Stage fit | 25 |
| Sector / thesis fit | 25 |
| Conflict risk | 15 |
| Check-size fit | 15 |
| Geography | 10 |
| Recent activity | 10 |

**Hard gates:** a 0 on **Stage fit** or **Conflict risk** caps the overall score at 20 — wrong stage or a direct-competitor conflict is close to disqualifying regardless of everything else. The weighted total and gates are computed deterministically in code ([`src/lib/scoring.ts`](src/lib/scoring.ts)), never by the model.

## Local development

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev                          # http://localhost:3000
```

Run the schema in the Supabase SQL editor: [`supabase/schema.sql`](supabase/schema.sql).

Handy scripts:

```bash
npx tsx scripts/test-one.ts "Seedcamp"      # one investor, end to end
npx tsx scripts/measure-cost.ts "Pi Labs"   # exact token + $ cost
npx tsx scripts/check-db.ts                  # Supabase connectivity
```

## Environment variables

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Research + scoring agent (server-side only). |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key, server-side only — writes past RLS. |
| `APP_ACCESS_PASSWORD` | Gates **new** research runs (which spend credits). Unset = gate off (local dev). **Set this in production.** |
| `ANTHROPIC_RESEARCH_MODEL` | Optional. Default `claude-haiku-4-5`. |
| `ANTHROPIC_SCORE_MODEL` | Optional. Default `claude-sonnet-4-6`. |

## Cost

~**$0.18 per investor** (Haiku research + Sonnet scoring), so ~**$1.79 per 10-investor raise**. The research call dominates (web-search results dominate input tokens). Measure exactly with `scripts/measure-cost.ts`.

## Deploy (Render — free, no request timeout)

Research takes ~60–90s/investor. Serverless platforms (e.g. Vercel Hobby) cap functions at 60s and will kill it; a **persistent Node server has no per-request timeout**, so Render's free web service is the easy fit.

1. Push this repo to GitHub.
2. Render → **New → Blueprint** → pick the repo. It reads [`render.yaml`](render.yaml).
3. Set the env vars (above) in the Render dashboard — including a strong `APP_ACCESS_PASSWORD`.
4. Run [`supabase/migrations/001_add_researching_status.sql`](supabase/migrations/001_add_researching_status.sql) in Supabase (adds the `researching` status used by the live-polling flow).
5. Deploy. First visit after idle has a ~30–60s cold start (free-tier spin-down).

For zero cold-starts, deploy the same repo to **Vercel Pro** instead (300s function limit) — no code changes needed.

## Data & ethics stance

- **Drafts, never sends** — a human stays on the send button.
- **Public business sources only** — no LinkedIn scraping or private/personal data.
- RLS enabled with no public policies; results reachable only through trusted server code.
