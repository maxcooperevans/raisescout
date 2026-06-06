import Anthropic from "@anthropic-ai/sdk";

/**
 * Anthropic client + model config. Server-side only — the key never reaches the
 * browser. Model is overridable via ANTHROPIC_MODEL so we can dial cost/quality
 * without code changes.
 */
let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.local.example).",
    );
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

/**
 * Per-phase models. Research is mostly summarising web-search results (the
 * token-heavy, expensive call) so it runs on cheaper Haiku; the judgment-heavy
 * scoring and the outreach draft run on Sonnet. Override via env if needed.
 */
export const RESEARCH_MODEL =
  process.env.ANTHROPIC_RESEARCH_MODEL ?? "claude-haiku-4-5";
export const SCORE_MODEL =
  process.env.ANTHROPIC_SCORE_MODEL ?? "claude-sonnet-4-6";

/** Pull a normalised usage record (incl. web searches) off a Messages response. */
export function extractUsage(res: Anthropic.Message): {
  input_tokens: number;
  output_tokens: number;
  web_search_requests: number;
} {
  return {
    input_tokens: res.usage.input_tokens ?? 0,
    output_tokens: res.usage.output_tokens ?? 0,
    web_search_requests: res.usage.server_tool_use?.web_search_requests ?? 0,
  };
}
