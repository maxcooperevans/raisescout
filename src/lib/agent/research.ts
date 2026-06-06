import type Anthropic from "@anthropic-ai/sdk";
import { extractUsage, getAnthropic, RESEARCH_MODEL } from "../anthropic";
import type { CallUsage, RaiseProfile } from "../types";

export interface ResearchResult {
  /** The agent's findings write-up, fed to the scoring phase. */
  report: string;
  /** Deduped public source URLs cited during research. */
  sources: string[];
  /** Number of web searches the agent actually ran. */
  searchCount: number;
  usage: CallUsage;
}

const SYSTEM = `You are a meticulous venture-capital research analyst helping a founder
decide whether a specific investor is a good fit for a specific raise.

Your job in THIS step is to PLAN and GATHER — not to score yet.

PLAN: For the given investor, you must verify these six things against the raise:
  1. Stage fit       — do they invest at the raise's stage (e.g. pre-seed / seed)?
  2. Sector/thesis    — does the raise match their stated focus?
  3. Geography        — do they invest in the raise's region?
  4. Check-size fit   — typical cheque vs. the round size being raised.
  5. Recent activity  — have they deployed recently, or gone quiet?
  6. Conflict risk    — have they backed a DIRECT competitor of this company?

GATHER: Use the web_search tool to find evidence from PUBLIC BUSINESS SOURCES only:
firm website and portfolio pages, partner bios and published theses/essays,
funding-round news and reputable press. Do NOT use or infer from LinkedIn personal
profiles or any private/personal data — public business sources only.

Rules:
- Search efficiently: a handful of targeted queries, not dozens.
- For every factual claim, keep the source URL it came from.
- If you cannot verify something, say so explicitly — do NOT guess or fabricate.
- Pay special attention to conflict checks: cross-reference the listed competitors
  against the investor's portfolio.

OUTPUT: A structured findings write-up with one short section per dimension above.
Under each, state what you found and the source URL(s). End with a "Sources" list of
every URL used. Be concrete and cite specifics (named portfolio companies, dates,
cheque sizes). This write-up will be handed to a scoring step, so completeness and
accurate sourcing matter more than prose.`;

function buildPrompt(raise: RaiseProfile, investorName: string): string {
  return `RAISE PROFILE
- Company: ${raise.company_name}
- Stage: ${raise.stage}
- Sector: ${raise.sector}
- Round size: ${raise.round_size}
- Geography: ${raise.geography}
- One-line thesis: ${raise.thesis}
- Known competitors (for conflict checks): ${
    raise.competitors.length ? raise.competitors.join(", ") : "(none provided)"
  }

INVESTOR TO RESEARCH: ${investorName}

Research this investor and produce the findings write-up as instructed.`;
}

/**
 * Phase 1 of the agent loop: plan + gather. One Anthropic call with the
 * server-side web_search tool — the model runs its own searches and returns the
 * final findings in a single response (no client tool round-trips needed).
 */
export async function researchInvestor(
  raise: RaiseProfile,
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
    messages: [{ role: "user", content: buildPrompt(raise, investorName) }],
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
    usage: extractUsage(res),
  };
}
