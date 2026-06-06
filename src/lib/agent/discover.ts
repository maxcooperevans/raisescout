import type Anthropic from "@anthropic-ai/sdk";
import { extractUsage, getAnthropic, RESEARCH_MODEL } from "../anthropic";
import type { CallUsage, RaiseProfile, SourcedSuggestion } from "../types";

export interface DiscoveryResult {
  suggestions: SourcedSuggestion[];
  /** Public source URLs consulted during discovery. */
  sources: string[];
  usage: CallUsage;
}

function sumUsage(a: CallUsage, b: CallUsage): CallUsage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    web_search_requests: a.web_search_requests + b.web_search_requests,
  };
}

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "submit_suggestions",
  description:
    "Submit the grounded suggestions. Include ONLY items that have a real " +
    "public source URL from the findings. Drop anything unsourced.",
  input_schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            source_url: {
              type: "string",
              description: "Public source URL evidencing this suggestion.",
            },
            reason: {
              type: "string",
              description:
                "One line citing the specific found fact (e.g. 'Led X's pre-seed proptech round, 2025').",
            },
          },
          required: ["name", "source_url", "reason"],
        },
      },
    },
    required: ["suggestions"],
  },
};

const EXTRACT_SYSTEM = `You convert research findings into a clean, structured list.
Rules:
- Include ONLY items that have a real, specific public source URL present in the findings.
- If an item has no source URL, DROP it entirely — no source, no suggestion.
- Do not invent or "remember" any item that isn't in the findings.
- SOURCE CHOICE: when the findings give more than one URL for an item, cite the highest-quality one —
  the firm's own website or a funding announcement / press piece BEFORE any aggregator, listicle, directory,
  or "top/most-active investors" roundup (e.g. proptechbuzz, seedtable, shizune, openvc, beauhurst roundups).
  Only fall back to an aggregator URL when it is the ONLY source available for an otherwise well-fit item.
- Keep each reason to one line, citing the concrete fact from the source.
Call submit_suggestions exactly once.`;

/**
 * Shared two-phase discovery: (1) gather candidates via the web_search tool from
 * public sources, (2) extract them into a structured, source-validated list.
 * Mirrors the research->score pattern so discovery is grounded the same way the
 * dimension scores are — never from model memory.
 */
async function groundedDiscovery(
  searchSystem: string,
  searchUser: string,
  client: Anthropic,
): Promise<DiscoveryResult> {
  // Phase 1 — gather from real public sources.
  const search = await client.messages.create({
    model: RESEARCH_MODEL,
    max_tokens: 3000,
    system: searchSystem,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
    messages: [{ role: "user", content: searchUser }],
  });

  const textParts: string[] = [];
  const sources = new Set<string>();
  for (const block of search.content) {
    if (block.type === "text") {
      textParts.push(block.text);
      for (const c of block.citations ?? []) {
        if ("url" in c && c.url) sources.add(c.url);
      }
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
  const findings = textParts.join("\n").trim();

  // Phase 2 — structure + validate (forced tool, no memory).
  const extract = await client.messages.create({
    model: RESEARCH_MODEL,
    max_tokens: 1500,
    system: EXTRACT_SYSTEM,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "submit_suggestions" },
    messages: [
      {
        role: "user",
        content: `FINDINGS:\n${findings}\n\nExtract the structured, source-backed list.`,
      },
    ],
  });

  const toolUse = extract.content.find((b) => b.type === "tool_use");
  const raw =
    toolUse && toolUse.type === "tool_use"
      ? (toolUse.input as { suggestions?: SourcedSuggestion[] })
      : { suggestions: [] };

  // HARD RULE: keep only suggestions with a real http(s) source URL; dedupe by name.
  const seen = new Set<string>();
  const suggestions: SourcedSuggestion[] = [];
  for (const s of raw.suggestions ?? []) {
    const name = (s.name ?? "").trim();
    const url = (s.source_url ?? "").trim();
    const key = name.toLowerCase();
    if (!name || !/^https?:\/\//i.test(url) || seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ name, source_url: url, reason: (s.reason ?? "").trim() });
  }

  return {
    suggestions,
    sources: [...sources],
    usage: sumUsage(extractUsage(search), extractUsage(extract)),
  };
}

/**
 * Source-quality hierarchy for grounding. Shared so any future grounded
 * discovery (e.g. finding contact methods) inherits the same discipline.
 * Ordered PREFERENCE with a fallback — deliberately NOT a hard gate, so we
 * don't bias toward big polished firms and miss thin-web-presence early-stage
 * backers and angels.
 */
const SOURCE_HIERARCHY = `SOURCE-QUALITY HIERARCHY (cite the highest tier you can actually verify):
  1. PRIMARY — the firm's own website / portfolio / stated investment focus (e.g. firmname.vc, firmname.com).
  2. PRIMARY RECORD — a funding-round announcement naming the backers, or a Companies House filing.
  3. REPUTABLE PRESS — an established outlet reporting a specific, dated round (e.g. TechCrunch, Sifted, UKTN).
  4. AGGREGATORS — listicles, "top/most-active VC" roundups, and directories. Examples to TREAT AS LEADS ONLY,
     never as the cited source: proptechbuzz.com, seedtable.com, shizune.co, peony.ink, openvc.app,
     beauhurst.com blog roundups, "best/top … investors" articles, Tracxn/PitchBook/Crunchbase list pages.

MANDATORY WORKFLOW — do this for every candidate:
- You may DISCOVER a name on a tier-4 aggregator, but you must then run a FOLLOW-UP search for that firm's
  OWN website (tier 1) or a funding announcement / press piece (tier 2-3), and cite THAT as source_url.
- The cited source_url must point at the firm itself or a record of a deal it did — NOT a listicle that merely
  lists it. A roundup URL standing in for a primary source is the single most common mistake; do not make it.
- Prefer RECENT sources: a firm's current site beats a year-old roundup for stage/thesis fit.

FALLBACK (do not over-filter): this is an ordered PREFERENCE, not a hard gate. Smaller funds and angels often
have thin web footprints. If, after genuinely trying, no tier 1-2 source exists, a credible recent tier-3 press
piece is acceptable. Only drop a candidate when you can find NO real source at all (including no firm website).
Do not drop a real, well-fit early-stage backer merely because its best source is press rather than a portfolio page.`;

function raiseBlock(raise: RaiseProfile): string {
  return `RAISE PROFILE
- Company: ${raise.company_name}
- Stage: ${raise.stage}
- Sector: ${raise.sector}
- Round size: ${raise.round_size}
- Geography: ${raise.geography}
- One-line thesis: ${raise.thesis}`;
}

// --- Investor discovery ------------------------------------------------------

export async function discoverInvestors(
  raise: RaiseProfile,
  opts: { seeds?: string[]; limit?: number; client?: Anthropic } = {},
): Promise<DiscoveryResult> {
  const { seeds = [], limit = 10, client = getAnthropic() } = opts;

  const seedClause = seeds.length
    ? `\n\nThe founder already likes these investors: ${seeds.join(", ")}. ` +
      `Find MORE real investors with a similar profile (stage / sector / geography). ` +
      `Do NOT just repeat the seeds — and do not include them in your output.`
    : "";

  const searchSystem = `You are a VC research analyst finding REAL investors that genuinely fit a specific raise.

Use the web_search tool against PUBLIC BUSINESS SOURCES only (no LinkedIn personal profiles or private data).

NON-NEGOTIABLE GROUNDING RULES:
- Every investor you propose MUST be evidenced by a real public source URL you found via search.
- Do NOT propose any investor you cannot source. No source, no suggestion.
- Do NOT rely on memory or "well-known" lists — names from memory are often wrong-stage, defunct, or invented, which would poison the scoring. Everything must trace to a search result.
- Match the raise: right STAGE (e.g. pre-seed/seed), SECTOR/thesis, and GEOGRAPHY. A famous fund that doesn't do this stage/geo is a bad suggestion.
- Quality over quantity: ${limit} well-sourced names is the ceiling, but returning 6 strongly-evidenced names is far better than padding to ${limit} with guesses.

${SOURCE_HIERARCHY}

A good workflow: aggregators/roundups are fine for finding candidate NAMES, but then search the firm's own site or a dated funding announcement to verify stage/sector/geo, and cite that higher-tier source.${seedClause}

OUTPUT: For each investor, give the name, the verified highest-tier source URL, and a one-line reason citing the specific fact (e.g. "Led Acme's pre-seed proptech round, 2025 [url]").`;

  return groundedDiscovery(searchSystem, raiseBlock(raise), client);
}

// --- Competitor discovery ----------------------------------------------------

export async function discoverCompetitors(
  raise: RaiseProfile,
  opts: { client?: Anthropic } = {},
): Promise<DiscoveryResult> {
  const { client = getAnthropic() } = opts;

  const searchSystem = `You find REAL companies that are direct competitors to a described product.

Use the web_search tool against PUBLIC sources only: company websites, product directories, market overviews, news, and "[product category] alternatives / competitors" sources.

NON-NEGOTIABLE GROUNDING RULES:
- Every competitor you propose MUST be evidenced by a real public source URL you found via search.
- Do NOT propose any company you cannot source, and do NOT invent companies from memory. No source, no suggestion.
- A "direct competitor" solves the same problem for the same kind of customer — not merely an adjacent or much larger company.
- These feed a conflict check (whether a prospective investor has backed a competitor), so a wrong name causes a wrong gate. Accuracy over coverage.

OUTPUT: For each competitor, give the name, the source URL, and a one-line reason (what they do / why they're a direct competitor) citing the source.`;

  const searchUser = `PRODUCT
- Company: ${raise.company_name}
- Sector: ${raise.sector}
- What it does: ${raise.thesis}

Find real, direct competitors with public sources.`;

  return groundedDiscovery(searchSystem, searchUser, client);
}
