import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "../anthropic";
import type { CallUsage, Enrichment, RaiseProfile, ScoreObject } from "../types";
import { draftIntro, type DraftIntro } from "./draft";
import { researchInvestorCached, type ResearchResult } from "./research";
import { scoreInvestor } from "./score";

export interface AssessmentUsage {
  research: CallUsage;
  score: CallUsage;
  draft: CallUsage | null;
  total: CallUsage;
}

function sumUsage(parts: Array<CallUsage | null>): CallUsage {
  return parts.reduce<CallUsage>(
    (acc, u) => {
      if (!u) return acc;
      return {
        input_tokens: acc.input_tokens + u.input_tokens,
        output_tokens: acc.output_tokens + u.output_tokens,
        web_search_requests: acc.web_search_requests + u.web_search_requests,
      };
    },
    { input_tokens: 0, output_tokens: 0, web_search_requests: 0 },
  );
}

export interface InvestorAssessment {
  investor_name: string;
  enrichment: Enrichment;
  score: ScoreObject;
  /** Null for gated/no-fit investors — we don't draft outreach to a hard no. */
  draft: DraftIntro | null;
  research: ResearchResult; // kept for transparency / debugging
  usage: AssessmentUsage;
}

/**
 * The full per-investor agent loop (spec §3): plan + gather (web search), score
 * with cited evidence, then draft a grounded first-touch. Runs for ONE investor
 * end to end.
 */
export async function assessInvestor(
  raise: RaiseProfile,
  investorName: string,
  client: Anthropic = getAnthropic(),
): Promise<InvestorAssessment> {
  // Phase 1: firm-level research. Cache-aware: hits the DB cache first, only
  // calls Anthropic on a miss or stale entry. The raise profile is NOT passed
  // to research (making it raise-agnostic and safe to cache). The scorer in
  // Phase 2 receives the full raise profile to judge fit and detect conflicts.
  const research = await researchInvestorCached(investorName, client);
  const { enrichment, score, usage: scoreUsage } = await scoreInvestor(
    raise,
    investorName,
    research,
    client,
  );

  // Don't waste a draft on a hard no — gated investors aren't worth outreach.
  const draft = score.is_gated
    ? null
    : await draftIntro(raise, investorName, enrichment, score, client);

  const usage: AssessmentUsage = {
    research: research.usage,
    score: scoreUsage,
    draft: draft?.usage ?? null,
    total: sumUsage([research.usage, scoreUsage, draft?.usage ?? null]),
  };

  return { investor_name: investorName, enrichment, score, draft, research, usage };
}

export interface BatchResult {
  investor_name: string;
  assessment: InvestorAssessment | null;
  error: string | null;
}

/**
 * Run the agent loop over many investors with bounded concurrency, so one slow
 * investor doesn't block the rest and we don't hammer the API. A failure on one
 * investor is captured, not fatal to the batch. `onResult` lets callers persist
 * / stream each result as it lands.
 */
export async function assessInvestors(
  raise: RaiseProfile,
  investorNames: string[],
  opts: {
    concurrency?: number;
    client?: Anthropic;
    onResult?: (r: BatchResult) => void | Promise<void>;
  } = {},
): Promise<BatchResult[]> {
  const { concurrency = 4, client = getAnthropic(), onResult } = opts;
  const results: BatchResult[] = new Array(investorNames.length);
  let next = 0;

  async function worker() {
    while (next < investorNames.length) {
      const i = next++;
      const name = investorNames[i];
      let result: BatchResult;
      try {
        const assessment = await assessInvestor(raise, name, client);
        result = { investor_name: name, assessment, error: null };
      } catch (e) {
        result = {
          investor_name: name,
          assessment: null,
          error: e instanceof Error ? e.message : String(e),
        };
      }
      results[i] = result;
      if (onResult) await onResult(result);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, investorNames.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
