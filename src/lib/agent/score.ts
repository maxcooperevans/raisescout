import type Anthropic from "@anthropic-ai/sdk";
import { extractUsage, getAnthropic, SCORE_MODEL } from "../anthropic";
import {
  DIMENSION_LABELS,
  DIMENSION_ORDER,
  DIMENSION_WEIGHTS,
  computeScoreTotals,
} from "../scoring";
import type {
  CallUsage,
  Confidence,
  Dimension,
  Enrichment,
  RaiseProfile,
  ScoreDimension,
  ScoreObject,
} from "../types";
import type { ResearchResult } from "./research";

export interface ScoredInvestor {
  enrichment: Enrichment;
  score: ScoreObject;
  usage: CallUsage;
}

// Shape the model returns. Weights/totals are NOT trusted from the model — we
// recompute them deterministically from the per-dimension scores below.
interface RawAssessment {
  enrichment: {
    firm_name: string | null;
    website: string | null;
    description: string | null;
    stages: string[];
    sectors: string[];
    geographies: string[];
    typical_check: string | null;
    notable_portfolio: string[];
  };
  dimensions: Array<{
    dimension: Dimension;
    score: number;
    confidence: Confidence;
    evidence: string;
    source_url: string | null;
  }>;
  summary: string;
}

const ASSESSMENT_TOOL: Anthropic.Tool = {
  name: "submit_investor_assessment",
  description:
    "Submit the structured fit assessment for this investor against the raise. " +
    "Every dimension must include concrete evidence and, where available, the source URL it came from.",
  input_schema: {
    type: "object",
    properties: {
      enrichment: {
        type: "object",
        properties: {
          firm_name: { type: ["string", "null"] },
          website: { type: ["string", "null"] },
          description: {
            type: ["string", "null"],
            description: "One-paragraph summary of the investor.",
          },
          stages: { type: "array", items: { type: "string" } },
          sectors: { type: "array", items: { type: "string" } },
          geographies: { type: "array", items: { type: "string" } },
          typical_check: { type: ["string", "null"] },
          notable_portfolio: {
            type: "array",
            items: { type: "string" },
            description: "Portfolio companies relevant to this raise.",
          },
        },
        required: [
          "firm_name",
          "website",
          "description",
          "stages",
          "sectors",
          "geographies",
          "typical_check",
          "notable_portfolio",
        ],
      },
      dimensions: {
        type: "array",
        description: "Exactly the six fit dimensions, each scored 0-5.",
        items: {
          type: "object",
          properties: {
            dimension: {
              type: "string",
              enum: DIMENSION_ORDER,
            },
            score: {
              type: "integer",
              minimum: 0,
              maximum: 5,
              description:
                "0-5, higher = better fit. For conflict_risk, 5 = no conflict, 0 = backed a direct competitor.",
            },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            evidence: {
              type: "string",
              description:
                "The specific found fact justifying the score. Never leave empty.",
            },
            source_url: {
              type: ["string", "null"],
              description:
                "Public source URL backing the evidence, or null if genuinely unverifiable.",
            },
          },
          required: ["dimension", "score", "confidence", "evidence", "source_url"],
        },
      },
      summary: {
        type: "string",
        description: "One-line overall rationale for the ranking.",
      },
    },
    required: ["enrichment", "dimensions", "summary"],
  },
};

const SYSTEM = `You are scoring an investor's fit for a specific raise, using ONLY the
research findings provided. Do not introduce facts that are not in the findings.

For each of the six dimensions, assign a score 0-5 (higher = better fit) and cite the
specific evidence and source URL from the findings. Rules:
- Every dimension MUST have a non-empty 'evidence' string. A score with no reason is
  not allowed — it is a guess.
- Prefer the real source URL from the findings. Only use null when the finding was
  genuinely unverifiable, and lower the confidence accordingly.
- Score conservatively when evidence is thin: low confidence + a middling/low score,
  with evidence that states what could not be confirmed.
- Hard signals: if the investor clearly does NOT do this stage, score stage_fit 0.
  If they have backed a DIRECT competitor, score conflict_risk 0. These are the
  cases that should tank an otherwise-good fit.
- conflict_risk scale is inverted relative to "risk": 5 means NO conflict found,
  0 means a direct-competitor conflict exists.

Call submit_investor_assessment exactly once with your complete assessment.`;

function buildPrompt(
  raise: RaiseProfile,
  investorName: string,
  research: ResearchResult,
): string {
  return `RAISE PROFILE
- Company: ${raise.company_name}
- Stage: ${raise.stage}
- Sector: ${raise.sector}
- Round size: ${raise.round_size}
- Geography: ${raise.geography}
- Thesis: ${raise.thesis}
- Known competitors: ${
    raise.competitors.length ? raise.competitors.join(", ") : "(none provided)"
  }

INVESTOR: ${investorName}

RESEARCH FINDINGS (your only source of truth):
${research.report}

SOURCES GATHERED:
${research.sources.map((s) => `- ${s}`).join("\n") || "(none)"}

Score this investor across all six dimensions and submit the assessment.`;
}

/**
 * Phase 2 of the agent loop: score with evidence. Forces a single structured
 * tool call so we always get a complete, machine-readable assessment. The
 * weighted /100 total and hard-gate logic are computed in code (computeScoreTotals),
 * never trusted to the model — keeping the maths deterministic and defensible.
 */
export async function scoreInvestor(
  raise: RaiseProfile,
  investorName: string,
  research: ResearchResult,
  client: Anthropic = getAnthropic(),
): Promise<ScoredInvestor> {
  const res = await client.messages.create({
    model: SCORE_MODEL,
    max_tokens: 3000,
    system: SYSTEM,
    tools: [ASSESSMENT_TOOL],
    tool_choice: { type: "tool", name: "submit_investor_assessment" },
    messages: [
      { role: "user", content: buildPrompt(raise, investorName, research) },
    ],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Scoring model did not return the assessment tool call.");
  }
  const raw = toolUse.input as RawAssessment;

  // Normalise to canonical order and attach the configured weights. The model
  // supplies score/evidence/source; the weight is ours, not its.
  const byDimension = new Map(raw.dimensions.map((d) => [d.dimension, d]));
  const dimensions: ScoreDimension[] = DIMENSION_ORDER.map((dim) => {
    const d = byDimension.get(dim);
    if (!d) {
      // Defensive: model omitted a dimension. Record it as unverified, not silently dropped.
      return {
        dimension: dim,
        score: 0,
        weight: DIMENSION_WEIGHTS[dim],
        confidence: "low",
        evidence: `No assessment returned for ${DIMENSION_LABELS[dim]}; treated as unverified.`,
        source_url: null,
      };
    }
    return {
      dimension: dim,
      score: Math.max(0, Math.min(5, Math.round(d.score))),
      weight: DIMENSION_WEIGHTS[dim],
      confidence: d.confidence,
      evidence: d.evidence?.trim() || "(no evidence provided)",
      source_url: d.source_url || null,
    };
  });

  const totals = computeScoreTotals(dimensions);

  const enrichment: Enrichment = {
    ...raw.enrichment,
    sources: research.sources,
  };

  const score: ScoreObject = {
    dimensions,
    ...totals,
    summary: raw.summary?.trim() || "",
  };

  return { enrichment, score, usage: extractUsage(res) };
}
