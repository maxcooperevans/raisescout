/** Quick Supabase connectivity + schema check. Run: npx tsx scripts/check-db.ts */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getServiceClient } from "../src/lib/supabase/server";

async function main() {
  const db = getServiceClient();
  for (const table of ["raises", "investors"]) {
    const { error, count } = await db
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) {
      console.error(`✗ ${table}: ${error.message}`);
      process.exitCode = 1;
    } else {
      console.log(`✓ ${table} reachable (rows: ${count ?? 0})`);
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
