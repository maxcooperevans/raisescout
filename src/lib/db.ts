import { getServiceClient } from "./supabase/server";
import type { InvestorRecord, RaiseProfile, ResearchStatus } from "./types";
import type { BatchResult } from "./agent";

/**
 * Persistence layer over Supabase. All access uses the service-role client
 * (server-side only). Keeps SQL/table knowledge in one place so route handlers
 * stay thin.
 */

export async function createRaise(raise: RaiseProfile): Promise<string> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("raises")
    .insert({
      company_name: raise.company_name,
      stage: raise.stage,
      sector: raise.sector,
      round_size: raise.round_size,
      geography: raise.geography,
      thesis: raise.thesis,
      competitors: raise.competitors,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create raise: ${error.message}`);
  return data.id as string;
}

/** Seed one 'pending' investor row per name; returns name -> row id. */
export async function createPendingInvestors(
  raiseId: string,
  names: string[],
): Promise<Map<string, string>> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("investors")
    .insert(names.map((name) => ({ raise_id: raiseId, name })))
    .select("id, name");

  if (error) throw new Error(`Failed to create investors: ${error.message}`);

  // Names can repeat; pair rows to names positionally as a fallback.
  const map = new Map<string, string>();
  (data ?? []).forEach((row) => {
    if (!map.has(row.name)) map.set(row.name, row.id);
  });
  return map;
}

/** Minimal investor row (id, raise, name, status) for the research worker. */
export async function getInvestorRow(investorId: string): Promise<{
  id: string;
  raise_id: string;
  name: string;
  research_status: ResearchStatus;
} | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("investors")
    .select("id, raise_id, name, research_status")
    .eq("id", investorId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load investor: ${error.message}`);
  return data ?? null;
}

/**
 * Atomically claim a pending investor for research by flipping
 * 'pending' -> 'researching'. Returns true only if THIS call won the row, so
 * two concurrent triggers (or a reload mid-run) can't double-process it.
 */
export async function claimInvestor(investorId: string): Promise<boolean> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("investors")
    .update({ research_status: "researching", error: null })
    .eq("id", investorId)
    .eq("research_status", "pending")
    .select("id");
  if (error) throw new Error(`Failed to claim investor: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Load a raise row as a RaiseProfile for the agent. */
export async function getRaiseProfile(raiseId: string): Promise<RaiseProfile> {
  const r = await getRaise(raiseId);
  return {
    company_name: r.company_name,
    stage: r.stage,
    sector: r.sector,
    round_size: r.round_size,
    geography: r.geography,
    thesis: r.thesis,
    competitors: r.competitors ?? [],
  };
}

/** Write the agent's result (or error) onto an existing investor row. */
export async function saveAssessment(
  investorId: string,
  result: BatchResult,
): Promise<void> {
  const db = getServiceClient();

  if (result.error || !result.assessment) {
    const { error } = await db
      .from("investors")
      .update({ research_status: "error", error: result.error ?? "Unknown error" })
      .eq("id", investorId);
    if (error) throw new Error(`Failed to save error: ${error.message}`);
    return;
  }

  const { enrichment, score, draft } = result.assessment;
  const { error } = await db
    .from("investors")
    .update({
      enrichment,
      score,
      overall_score: score.weighted_total,
      is_gated: score.is_gated,
      draft_intro: draft ? `Subject: ${draft.subject}\n\n${draft.body}` : null,
      research_status: "complete",
      error: null,
    })
    .eq("id", investorId);

  if (error) throw new Error(`Failed to save assessment: ${error.message}`);
}

/** All investors for a raise, ranked best-fit first (gated/unscored sink). */
export async function getRankedInvestors(
  raiseId: string,
): Promise<InvestorRecord[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("investors")
    .select("*")
    .eq("raise_id", raiseId)
    .order("overall_score", { ascending: false, nullsFirst: false });

  if (error) throw new Error(`Failed to fetch investors: ${error.message}`);
  return (data ?? []) as InvestorRecord[];
}

export async function getRaise(raiseId: string) {
  const db = getServiceClient();
  const { data, error } = await db
    .from("raises")
    .select("*")
    .eq("id", raiseId)
    .single();
  if (error) throw new Error(`Failed to fetch raise: ${error.message}`);
  return data;
}
