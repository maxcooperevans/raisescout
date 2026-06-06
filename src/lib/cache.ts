/**
 * Investor research cache — server-side only.
 *
 * Caches Phase 1 (web-search research) per firm name. The fit score (Phase 2)
 * is NOT cached: it is raise-specific and must recompute each run.
 *
 * Cache key: normalized firm name (lowercase + non-alphanumeric stripped), so
 * "Seedcamp", "seedcamp", and "Seedcamp " all share one row.
 *
 * TTL: entries older than CACHE_TTL_DAYS are treated as stale and ignored.
 * When stale, the caller re-researches and writes a fresh entry (upsert).
 */

import { getServiceClient } from "./supabase/server";
import type { ResearchResult } from "./agent/research";

/** Treat cached research older than this as stale and re-research. */
export const CACHE_TTL_DAYS = 30;

/**
 * Normalise a firm name to a stable, lookup-friendly cache key.
 * Strips whitespace, punctuation, casing so:
 *   "Seedcamp"  → "seedcamp"
 *   "seedcamp " → "seedcamp"
 *   "Y Combinator" → "ycombinator"
 *   "a16z"        → "a16z"
 */
export function normalizeCacheKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Look up cached research for an investor.
 * Returns null on a miss (not in DB) or stale hit (older than CACHE_TTL_DAYS).
 * The returned result carries fromCache: true and zero usage (no API cost).
 */
export async function getCachedResearch(
  investorName: string,
): Promise<ResearchResult | null> {
  const key = normalizeCacheKey(investorName);
  const db = getServiceClient();

  interface CacheRow {
    report: string;
    sources: unknown;
    search_count: number;
    last_researched_at: string;
  }

  let data: CacheRow | null = null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (db as any)
      .from("investor_research_cache")
      .select("report, sources, search_count, last_researched_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (result.error) return null;
    data = result.data as CacheRow | null;
  } catch {
    // Cache read failure is non-fatal; fall through to fresh research.
    return null;
  }

  if (!data) return null;

  // Enforce TTL — stale entries are discarded so the next call researches fresh.
  const ageMs = Date.now() - new Date(data.last_researched_at).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays > CACHE_TTL_DAYS) return null;

  console.log(`[cache] HIT for "${investorName}" (key: ${key}, age: ${ageDays.toFixed(1)}d)`);

  return {
    report: data.report,
    sources: Array.isArray(data.sources) ? (data.sources as string[]) : [],
    searchCount: data.search_count,
    fromCache: true,
    // No API cost on a cache hit.
    usage: { input_tokens: 0, output_tokens: 0, web_search_requests: 0 },
  };
}

/**
 * Persist (upsert) a fresh research result for future cache hits.
 * Best-effort: write failures are logged but never thrown.
 */
export async function setCachedResearch(
  investorName: string,
  result: ResearchResult,
): Promise<void> {
  const key = normalizeCacheKey(investorName);
  const db = getServiceClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).from("investor_research_cache").upsert(
      {
        cache_key: key,
        investor_name: investorName,
        report: result.report,
        sources: result.sources,
        search_count: result.searchCount,
        last_researched_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" },
    );
    if (error) {
      console.warn(`[cache] Write failed for "${investorName}":`, error.message);
    } else {
      console.log(`[cache] WRITE for "${investorName}" (key: ${key})`);
    }
  } catch (e) {
    console.warn(`[cache] Write exception for "${investorName}":`, e);
  }
}
