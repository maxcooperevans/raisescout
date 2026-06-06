/**
 * Measure the exact token + web-search cost of ONE investor assessment.
 * Run: npx tsx scripts/measure-cost.ts "Investor Name"
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { assessInvestor } from "../src/lib/agent";
import { RESEARCH_MODEL, SCORE_MODEL } from "../src/lib/anthropic";
import { costForUsage, WEB_SEARCH_PER_REQUEST } from "../src/lib/pricing";
import type { CallUsage, RaiseProfile } from "../src/lib/types";

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

function line(label: string, u: CallUsage, model: string) {
  const cost = costForUsage(u, model);
  console.log(
    `  ${label.padEnd(9)} [${model}] in=${String(u.input_tokens).padStart(7)} ` +
      `out=${String(u.output_tokens).padStart(5)} ` +
      `search=${u.web_search_requests} ` +
      `→ $${cost.toFixed(4)}`,
  );
}

async function main() {
  const name = process.argv[2] ?? "Pi Labs";
  console.log(
    `\nMeasuring "${name}" (research: ${RESEARCH_MODEL}, score/draft: ${SCORE_MODEL})…\n`,
  );
  const t0 = Date.now();
  const { score, draft, usage } = await assessInvestor(SAMPLE_RAISE, name);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);

  console.log(
    `Result: ${score.weighted_total}/100${score.is_gated ? " [gated]" : ""}, ` +
      `draft ${draft ? "yes" : "skipped"}, ${secs}s\n`,
  );

  console.log("Per-call usage:");
  line("research", usage.research, RESEARCH_MODEL);
  line("score", usage.score, SCORE_MODEL);
  if (usage.draft) line("draft", usage.draft, SCORE_MODEL);
  else console.log("  draft     (skipped — gated)");

  // Total cost must use each call's own model (research = Haiku, rest = Sonnet).
  const totalCost =
    costForUsage(usage.research, RESEARCH_MODEL) +
    costForUsage(usage.score, SCORE_MODEL) +
    (usage.draft ? costForUsage(usage.draft, SCORE_MODEL) : 0);

  const t = usage.total;
  console.log("\nTOTAL:");
  console.log(`  input tokens:  ${t.input_tokens.toLocaleString()}`);
  console.log(`  output tokens: ${t.output_tokens.toLocaleString()}`);
  console.log(
    `  web searches:  ${t.web_search_requests} ($${(t.web_search_requests * WEB_SEARCH_PER_REQUEST).toFixed(2)})`,
  );
  console.log(`\n  ==> $${totalCost.toFixed(4)} for this investor`);
  console.log(`  ==> ~$${(totalCost * 10).toFixed(2)} for a 10-investor raise\n`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
