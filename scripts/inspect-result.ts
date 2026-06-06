import { config } from "dotenv";
config({ path: ".env.local" });
import { getRankedInvestors } from "../src/lib/db";

async function main() {
  const investors = await getRankedInvestors(
    "9e9b1f8e-7582-4044-ba59-58c8e1c26958",
  );
  console.log("Investors persisted:", investors.length);
  for (const inv of investors) {
    console.log(
      `\n#${inv.name} — ${inv.overall_score}/100 ${inv.is_gated ? "[GATED]" : ""}`,
    );
    const e = inv.enrichment;
    if (e)
      console.log(
        `  enrich: ${e.firm_name} | check ${e.typical_check} | ${e.sources.length} sources`,
      );
    for (const d of inv.score?.dimensions ?? []) {
      console.log(
        `   ${d.dimension}: ${d.score}/5 (${d.confidence}) source=${d.source_url ? "yes" : "NONE"}`,
      );
    }
    console.log(
      `  draft: ${inv.draft_intro ? inv.draft_intro.replace(/\n/g, " ").slice(0, 110) + "…" : "(none — gated)"}`,
    );
  }
}
main();
