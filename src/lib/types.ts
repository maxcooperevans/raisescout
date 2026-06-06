/**
 * Shared domain types for RaiseScout v0.
 *
 * The `score` and `enrichment` shapes here mirror exactly what is stored in the
 * `investors` JSONB columns (see supabase/schema.sql). Keeping them in one place
 * means the agent (writer) and the UI (reader) never drift.
 */

// --- Raise profile (what the founder provides) -------------------------------

export interface RaiseProfile {
  company_name: string;
  stage: string; // e.g. "Pre-seed", "Seed"
  sector: string; // e.g. "B2B SaaS / proptech"
  round_size: string; // free text, e.g. "£1.5M"
  geography: string; // e.g. "UK / Europe"
  thesis: string; // one-line pitch
  competitors: string[]; // known competitor names — powers conflict detection
}

// --- Token / tool usage (for cost tracking) ----------------------------------

export interface CallUsage {
  input_tokens: number;
  output_tokens: number;
  /** Server-side web searches billed separately ($/1k searches). */
  web_search_requests: number;
}

// --- Enrichment (what the agent finds about an investor) ---------------------

export interface Enrichment {
  firm_name: string | null;
  website: string | null;
  /** One-paragraph summary of who they are. */
  description: string | null;
  /** Stages they invest at, as found (e.g. ["pre-seed", "seed"]). */
  stages: string[];
  /** Sectors / thesis focus, as found. */
  sectors: string[];
  /** Geographies they invest in. */
  geographies: string[];
  /** Typical cheque size, free text as found (e.g. "$250k–$1M"). */
  typical_check: string | null;
  /** Notable / relevant portfolio companies referenced during research. */
  notable_portfolio: string[];
  /** Sources consulted, deduped. */
  sources: string[];
}

// --- Structured score (spec §4) ----------------------------------------------

export type Confidence = "low" | "medium" | "high";

export type Dimension =
  | "stage_fit"
  | "sector_fit"
  | "geography"
  | "check_size_fit"
  | "recent_activity"
  | "conflict_risk";

/**
 * A single dimension sub-score. Every sub-score MUST carry evidence and a
 * source_url — a score without a reason is a guess (spec §4). Scale is 0–5,
 * higher = better fit (for conflict_risk, 5 = no conflicts, 0 = backed a direct
 * competitor).
 */
export interface ScoreDimension {
  dimension: Dimension;
  score: number; // 0–5
  weight: number; // points this dimension contributes to the /100 total
  confidence: Confidence;
  evidence: string; // human-readable reason, citing the found fact
  source_url: string | null; // public source backing the evidence
}

export interface ScoreObject {
  dimensions: ScoreDimension[];
  /** Weighted total out of 100, after gate capping. */
  weighted_total: number;
  /**
   * True when a hard gate fired (a 0 on stage_fit or conflict_risk). When
   * gated, weighted_total is capped low regardless of other dimensions.
   */
  is_gated: boolean;
  gate_reason: string | null;
  /** One-line overall rationale for the rank. */
  summary: string;
}

// --- Persisted record shape (mirrors the investors table) --------------------

export type ResearchStatus =
  | "pending"
  | "researching"
  | "complete"
  | "error";

export interface InvestorRecord {
  id: string;
  raise_id: string;
  created_at: string;
  name: string; // investor / firm name as entered by the founder
  enrichment: Enrichment | null;
  score: ScoreObject | null;
  overall_score: number | null; // denormalised weighted_total for ranking
  is_gated: boolean;
  draft_intro: string | null;
  research_status: ResearchStatus;
  error: string | null;
}
