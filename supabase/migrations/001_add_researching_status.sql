-- Migration: add 'researching' to the investors.research_status states.
-- Run this in the Supabase SQL editor if you already created the tables before
-- the per-investor (live-polling) flow. Fresh installs from schema.sql already
-- include it.

alter table public.investors
  drop constraint if exists investors_research_status_check;

alter table public.investors
  add constraint investors_research_status_check
  check (research_status in ('pending','researching','complete','error'));
