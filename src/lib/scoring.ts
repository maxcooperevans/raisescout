import type { Dimension, ScoreDimension, ScoreObject } from "./types";

/**
 * Scoring weights (spec §4). Weights sum to 100. The rationale — encoding what
 * actually makes an investor a fit — is the defensible core of the product, so
 * it lives in one named place rather than scattered through prompts.
 *
 * Weighting logic:
 *  - Stage and Sector/thesis are the two strongest signals of a real fit (25 each).
 *  - Conflict and Check-size can each quietly kill a deal (15 each).
 *  - Geography and Recent activity are real but secondary filters (10 each).
 */
export const DIMENSION_WEIGHTS: Record<Dimension, number> = {
  stage_fit: 25,
  sector_fit: 25,
  conflict_risk: 15,
  check_size_fit: 15,
  geography: 10,
  recent_activity: 10,
};

export const DIMENSION_LABELS: Record<Dimension, string> = {
  stage_fit: "Stage fit",
  sector_fit: "Sector / thesis fit",
  conflict_risk: "Conflict risk",
  check_size_fit: "Check-size fit",
  geography: "Geography",
  recent_activity: "Recent activity",
};

export const SCORE_MAX = 5; // each dimension scored 0–5

/**
 * Hard gates: a 0 on either of these is treated as close to disqualifying
 * regardless of how strong the rest looks (spec §4 "why it can tank a score").
 * Wrong stage = hard no; led/backed a direct competitor = usually disqualifying.
 */
export const GATE_DIMENSIONS: Dimension[] = ["stage_fit", "conflict_risk"];

/** When a gate fires, the overall total is capped at this value out of 100. */
export const GATE_CAP = 20;

export const DIMENSION_ORDER: Dimension[] = [
  "stage_fit",
  "sector_fit",
  "conflict_risk",
  "check_size_fit",
  "geography",
  "recent_activity",
];

/**
 * Compute the weighted /100 total and apply hard gates. Pure function so it can
 * be unit-tested and reused by both the agent and any re-scoring path.
 *
 * Each dimension contributes (score / SCORE_MAX) * weight. A 0 on a gate
 * dimension caps the final total at GATE_CAP and records why.
 */
export function computeScoreTotals(
  dimensions: ScoreDimension[],
): Pick<ScoreObject, "weighted_total" | "is_gated" | "gate_reason"> {
  const raw = dimensions.reduce((sum, d) => {
    const clamped = Math.max(0, Math.min(SCORE_MAX, d.score));
    return sum + (clamped / SCORE_MAX) * d.weight;
  }, 0);

  const gateHits = dimensions.filter(
    (d) => GATE_DIMENSIONS.includes(d.dimension) && d.score === 0,
  );

  if (gateHits.length > 0) {
    const reason = gateHits
      .map((d) => `${DIMENSION_LABELS[d.dimension]} scored 0 — ${d.evidence}`)
      .join(" ");
    return {
      weighted_total: Math.min(GATE_CAP, Math.round(raw)),
      is_gated: true,
      gate_reason: reason,
    };
  }

  return {
    weighted_total: Math.round(raw),
    is_gated: false,
    gate_reason: null,
  };
}
