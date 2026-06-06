import type Anthropic from "@anthropic-ai/sdk";
import { extractUsage, getAnthropic, RESEARCH_MODEL } from "../anthropic";
import { getCachedResearch, setCachedResearch } from "../cache";
import type { CallUsage } from "../types";

export interface ResearchResult {
  /** The agent's findings write-up, fed to the scoring phase. */
  report: string;
  /** Deduped public source URLs cited during research. */
  sources: string[];
  /** Number of web searches the agent actually ran. */
  searchCount: number;
  /**
   * True when this result was served from the cache (no API cost).
   * False when freshly researched and written back to the cache.
   */
  fromCache: boolean;
  usage: CallUsage;
}

// ─── System prompt ────────────────────────────────────────────────────────────
//
// The research phase is FIRM-LEVEL — it must produce the same useful output
// regardless of which raise the investor is later scored against. Raise-specific
// judgment (e.g. "does their stage match THIS raise?") happens in the scoring
// phase (score.ts), which always receives the full raise profile.
//
// Keeping research raise-agnostic is what makes the cache safe: a cached brief
// for Seedcamp is equally valid when scoring Seedcamp against any raise.
//
// PORTFOLIO COMPLETENESS is the most critical output. It is used for conflict
// detection: the scorer cross-references the portfolio against the raise's known
// competitors. If the portfolio list is thin, conflicts can be missed.

const SYSTEM = `You are a meticulous venture-capital research analyst. Your job is to
produce a comprehensive intelligence brief on a given VC firm or investor, sourced
entirely from PUBLIC BUSINESS SOURCES.

Do NOT score the investor and do NOT judge fit against any particular raise — that
is handled separately. Your only job is to research and report facts.

Research these six dimensions thoroughly:

  1. STAGE FOCUS    — what stages do they invest at (pre-seed / seed / Series A / etc.)?
                      Look for explicit statements on their website and in press.

  2. SECTOR/THESIS  — what sectors and investment thesis do they focus on?
                      Quote their stated thesis if available.

  3. GEOGRAPHY      — what geographies do they invest in? Note any hard restrictions.

  4. CHECK SIZE     — typical cheque / ticket size? Ranges are fine if exact figures
                      are unavailable.

  5. RECENT ACTIVITY — when did they last announce a new investment?
                       Have they been actively deploying in the past 12 months?
                       Note any signals of fund activity (new fund close, portfolio news).

  6. PORTFOLIO      — list ALL known portfolio companies you can find as comprehensively
                      as possible. This list is critical: it will be cross-referenced
                      against any raise's competitors for conflict detection. Be thorough —
                      a thin list here can hide a real conflict.

Use the web_search tool to find evidence from PUBLIC BUSINESS SOURCES only:
firm website and portfolio pages, partner bios and published theses / essays,
funding-round news and reputable press.

Do NOT use LinkedIn personal profiles or any private / personal data. Public business
sources only.

Rules:
— Search efficiently: a handful of targeted queries, not dozens.
— For every factual claim, keep the source URL it came from.
— If you cannot verify something, say so explicitly — do NOT guess or fabricate.
— If a source is an aggregator blog (e.g. seedtable.com, openvc.app), chase back to a
  primary source (firm site, press article) before citing it.

OUTPUT: A structured findings brief with one section per dimension. Under each, state
what you found and the source URL(s). End with a deduplicated "Sources" list of every
URL used. Be concrete and cite specifics (named portfolio companies, dates, cheque
sizes). This brief will be the sole input to a scoring agent, so completeness and
accurate sourcing matter more than prose.`;

function buildPrompt(investorName: string): string {
  return `INVESTOR TO RESEARCH: ${investorName}

Research this investor thoroughly and produce the comprehensive findings brief as instructed.
Pay particular attention to the complete portfolio list — be as exhaustive as possible.`;
}

// ─── Core research call (no cache) ───────────────────────────────────────────

/**
 * Phase 1 of the agent loop — UNCACHED.
 * Calls the Anthropic web-search model and returns a structured findings brief.
 * Prefer calling `researchInvestorCached` in production so repeated firms are
 * served from the DB cache and not re-billed.
 */
export async function researchInvestor(
  investorName: string,
  client: Anthropic = getAnthropic(),
): Promise<ResearchResult> {
  const res = await client.messages.create({
    model: RESEARCH_MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 6,
      },
    ],
    messages: [{ role: "user", content: buildPrompt(investorName) }],
  });

  const textParts: string[] = [];
  const sources = new Set<string>();
  let searchCount = 0;

  for (const block of res.content) {
    if (block.type === "text") {
      textParts.push(block.text);
      // Citations attached to text blocks carry the public source URLs.
      for (const c of block.citations ?? []) {
        if ("url" in c && c.url) sources.add(c.url);
      }
    } else if (block.type === "server_tool_use") {
      searchCount += 1;
    } else if (block.type === "web_search_tool_result") {
      const content = block.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === "web_search_result" && item.url) {
            sources.add(item.url);
          }
        }
      }
    }
  }

  return {
    report: textParts.join("\n").trim(),
    sources: [...sources],
    searchCount,
    fromCache: false,
    usage: extractUsage(res),
  };
}

// ─── Cache-aware wrapper ──────────────────────────────────────────────────────

/**
 * Phase 1 of the agent loop — CACHE-AWARE.
 *
 * 1. Check the DB cache keyed on the normalized firm name.
 * 2. On a HIT (within TTL): return the cached brief instantly, zero API cost.
 * 3. On a MISS or STALE: run fresh web-search research, write to cache, return.
 *
 * Cache failures are non-fatal — a read/write error simply falls through to
 * fresh research, so a broken cache never stops a raise from completing.
 */
export async function researchInvestorCached(
  investorName: string,
  client: Anthropic = getAnthropic(),
): Promise<ResearchResult> {
  // 1. Try cache first.
  const cached = await getCachedResearch(investorName);
  if (cached) return cached;

  // 2. Cache miss or stale — run fresh research.
  console.log(`[cache] MISS for "${investorName}" — running fresh research`);
  const fresh = await researchInvestor(investorName, client);

  // 3. Write to cache (best-effort — don't block on failure).
  void setCachedResearch(investorName, fresh);

  return fresh;
}
