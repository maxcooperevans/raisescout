/**
 * Manual end-to-end test of the single-investor agent loop.
 * Run: npx tsx scripts/test-one.ts "Investor Name"
 *
 * Loads .env.local for ANTHROPIC_API_KEY. Does NOT touch the database — this
 * proves the research-and-score loop in isolation (Step 2).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { assessInvestor } from "../src/lib/agent";
import { DIMENSION_LABELS } from "../src/lib/scoring";
import type { RaiseProfile } from "../src/lib/types";

// A realistic sample raise to score against.
const SAMPLE_RAISE: RaiseProfile = {
  company_name: "Surveyr",
  stage: "Pre-seed",
  sector: "Proptech / B2B SaaS (property inspection software)",
  round_size: "£750k",
  geography: "UK",
  thesis:
    "AI-assisted property inspection software that turns a phone walkthrough into a structured surveyor-grade report.",
  competitors: ["GoReport", "Inventory Hive", "InventoryBase"],
};

async function main() {
  const investorName = process.argv[2] ?? "Seedcamp";
  console.log(`\n=== Researching "${investorName}" for ${SAMPLE_RAISE.company_name} ===\n`);

  const t0 = Date.now();
  const { enrichment, score, draft, research } = await assessInvestor(
    SAMPLE_RAISE,
    investorName,
  );
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`Searches run: ${research.searchCount} | sources: ${research.sources.length} | ${secs}s\n`);

  console.log("--- ENRICHMENT ---");
  console.log(`Firm:    ${enrichment.firm_name}`);
  console.log(`Website: ${enrichment.website}`);
  console.log(`Stages:  ${enrichment.stages.join(", ")}`);
  console.log(`Sectors: ${enrichment.sectors.join(", ")}`);
  console.log(`Geos:    ${enrichment.geographies.join(", ")}`);
  console.log(`Check:   ${enrichment.typical_check}`);
  console.log(`Portfolio (relevant): ${enrichment.notable_portfolio.join(", ")}`);
  console.log(`\n${enrichment.description}\n`);

  console.log("--- SCORE ---");
  for (const d of score.dimensions) {
    console.log(
      `\n[${DIMENSION_LABELS[d.dimension]}]  ${d.score}/5  (weight ${d.weight}, conf ${d.confidence})`,
    );
    console.log(`  evidence: ${d.evidence}`);
    console.log(`  source:   ${d.source_url ?? "(none)"}`);
  }

  console.log(`\n========================================`);
  console.log(`OVERALL: ${score.weighted_total}/100${score.is_gated ? "  [GATED]" : ""}`);
  if (score.gate_reason) console.log(`Gate: ${score.gate_reason}`);
  console.log(`Summary: ${score.summary}`);
  console.log(`========================================\n`);

  console.log("--- DRAFT INTRO ---");
  if (draft) {
    console.log(`Subject: ${draft.subject}`);
    console.log(`\n${draft.body}`);
    console.log(`\n(${draft.body.split(/\s+/).length} words)\n`);
  } else {
    console.log("(skipped — investor is gated / no-fit)\n");
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
