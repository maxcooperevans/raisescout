/**
 * Prove discovery returns REAL, web-sourced suggestions (not model memory).
 * Run: npx tsx scripts/test-discover.ts
 *
 * Runs all three relevant paths against the Surveyr raise:
 *   1. Investors from scratch
 *   2. Investors seed + expand
 *   3. Competitors from the thesis
 * Prints name / source_url / reason for each so they can be eyeballed.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { discoverCompetitors, discoverInvestors } from "../src/lib/agent/discover";
import { RESEARCH_MODEL } from "../src/lib/anthropic";
import { costForUsage } from "../src/lib/pricing";
import type { DiscoveryResult } from "../src/lib/agent/discover";
import type { RaiseProfile } from "../src/lib/types";

const RAISE: RaiseProfile = {
  company_name: "Surveyr",
  stage: "Pre-seed",
  sector: "Proptech / B2B SaaS (property inspection software)",
  round_size: "£750k",
  geography: "UK",
  thesis:
    "AI-assisted property inspection software that turns a phone walkthrough into a structured surveyor-grade report.",
  competitors: [],
};

function show(title: string, r: DiscoveryResult) {
  console.log(`\n=== ${title} — ${r.suggestions.length} suggestion(s) ===`);
  r.suggestions.forEach((s, i) => {
    console.log(`\n ${i + 1}. ${s.name}`);
    console.log(`    reason: ${s.reason}`);
    console.log(`    source: ${s.source_url}`);
  });
  console.log(
    `\n  [${r.sources.length} sources consulted · $${costForUsage(r.usage, RESEARCH_MODEL).toFixed(4)}]`,
  );
}

async function main() {
  console.log(`Discovery model: ${RESEARCH_MODEL}`);

  const scratch = await discoverInvestors(RAISE, { limit: 10 });
  show("INVESTORS — from scratch", scratch);

  const expand = await discoverInvestors(RAISE, {
    seeds: ["Seedcamp", "LocalGlobe"],
    limit: 8,
  });
  show("INVESTORS — seed + expand (Seedcamp, LocalGlobe)", expand);

  // Pass "investors" to skip the (unchanged) competitor path and save credits.
  if (process.argv[2] !== "investors") {
    const comps = await discoverCompetitors(RAISE);
    show("COMPETITORS — from thesis", comps);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
