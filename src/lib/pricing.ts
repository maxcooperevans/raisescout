import type { CallUsage } from "./types";

/**
 * Anthropic API pricing, USD. VERIFY against current rates at
 * https://www.anthropic.com/pricing before quoting — these are the published
 * rates as of mid-2026 and may change.
 *
 * Token rates are per 1M tokens. Web search is billed per request.
 */
export const TOKEN_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-4-8": { input: 15, output: 75 },
};

export const WEB_SEARCH_PER_REQUEST = 10 / 1000; // $10 per 1,000 searches

export function costForUsage(usage: CallUsage, model: string): number {
  const rate = TOKEN_PRICING[model] ?? TOKEN_PRICING["claude-sonnet-4-6"];
  const inputCost = (usage.input_tokens / 1_000_000) * rate.input;
  const outputCost = (usage.output_tokens / 1_000_000) * rate.output;
  const searchCost = usage.web_search_requests * WEB_SEARCH_PER_REQUEST;
  return inputCost + outputCost + searchCost;
}
