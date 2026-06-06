-- RaiseScout — Migration 002: investor research cache
-- Run this in the Supabase SQL editor AFTER 001_add_researching_status.sql.
--
-- Why this exists:
--   Researching the same firm (e.g. Seedcamp) for every new raise wastes
--   Anthropic credits and slows down results. This table caches the firm-level
--   intelligence gathered during Phase 1 (web-search research). The fit score
--   (Phase 2) is never cached — it is raise-specific and must recompute each run.
--
-- Cache key: normalized firm name (lowercase, non-alphanumeric stripped) so
--   "Seedcamp", "seedcamp", and "Seedcamp " all hit the same row.
-- TTL: see CACHE_TTL_DAYS in src/lib/cache.ts (currently 30 days).
--   Entries older than that are treated as stale and re-researched.

create table if not exists public.investor_research_cache (
  cache_key          text        primary key,  -- normalize_cache_key(investor_name)
  investor_name      text        not null,     -- original name, for display / debugging
  report             text        not null,     -- full research write-up fed to the scorer
  sources            jsonb       not null default '[]',  -- deduped source URLs (string[])
  search_count       integer     not null default 0,     -- how many web searches were run
  created_at         timestamptz not null default now(),
  last_researched_at timestamptz not null default now()  -- updated on each fresh research
);

-- Index so a lookup by cache_key + recency check is fast.
create index if not exists irc_cache_key_idx
  on public.investor_research_cache (cache_key, last_researched_at desc);

-- Lock down to service-role exactly as the other tables.
alter table public.investor_research_cache enable row level security;
-- No public policies — all access via service-role key (server-side only).
