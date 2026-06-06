-- RaiseScout v0 schema
-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.

-- gen_random_uuid() lives in pgcrypto (enabled by default on Supabase, but be safe).
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- raises: one row per fundraise. Holds the raise context the agent scores
-- each investor against. (Multiple-raises scope chosen for v0.)
-- ---------------------------------------------------------------------------
create table if not exists public.raises (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  company_name text not null,
  stage        text not null,          -- e.g. 'Pre-seed', 'Seed'
  sector       text not null,          -- e.g. 'B2B SaaS / proptech'
  round_size   text not null,          -- free text, e.g. '£1.5M'
  geography    text not null,          -- e.g. 'UK / Europe'
  thesis       text not null,          -- one-line pitch
  competitors  text[] not null default '{}'  -- known competitor names (conflict detection)
);

-- ---------------------------------------------------------------------------
-- investors: one row per investor researched for a raise.
--   enrichment      -> public-source research findings (Enrichment type)
--   score           -> structured multi-dimension score object (ScoreObject type)
--   overall_score   -> denormalised weighted total /100, for cheap ranking/sort
--   draft_intro     -> the personalised first-touch draft (NEVER auto-sent)
-- JSONB is used for enrichment/score so the structured shape can evolve without
-- migrations; the canonical shapes live in src/lib/types.ts.
-- ---------------------------------------------------------------------------
create table if not exists public.investors (
  id              uuid primary key default gen_random_uuid(),
  raise_id        uuid not null references public.raises(id) on delete cascade,
  created_at      timestamptz not null default now(),
  name            text not null,                 -- investor / firm name as entered
  enrichment      jsonb,                          -- Enrichment | null
  score           jsonb,                          -- ScoreObject | null
  overall_score   numeric,                        -- weighted_total mirror, null until scored
  is_gated        boolean not null default false,
  draft_intro     text,
  research_status text not null default 'pending' -- 'pending' | 'researching' | 'complete' | 'error'
                  check (research_status in ('pending','researching','complete','error')),
  error           text                            -- populated when research_status = 'error'
);

-- Rank/sort investors within a raise by fit, best first.
create index if not exists investors_raise_score_idx
  on public.investors (raise_id, overall_score desc nulls last);

-- ---------------------------------------------------------------------------
-- Row Level Security.
-- v0 has no end-user auth: all reads/writes go through trusted server code
-- using the service-role key, which bypasses RLS. We enable RLS and add NO
-- public policies, so the anon key (browser) can read/write nothing directly.
-- This is the GDPR-friendly default (spec §8) — lock down by design.
-- ---------------------------------------------------------------------------
alter table public.raises    enable row level security;
alter table public.investors enable row level security;
