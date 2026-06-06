import { config } from "dotenv";
config({ path: ".env.local" });
import { getServiceClient } from "../src/lib/supabase/server";

async function main() {
  const db = getServiceClient();
  const { data: raises } = await db
    .from("raises")
    .select("id, company_name")
    .order("created_at", { ascending: false })
    .limit(1);
  const raise = raises?.[0];
  console.log("Latest raise:", raise?.company_name, raise?.id);
  if (raise) {
    const { data: inv } = await db
      .from("investors")
      .select("name, research_status, overall_score, is_gated")
      .eq("raise_id", raise.id)
      .order("overall_score", { ascending: false, nullsFirst: false });
    for (const i of inv ?? [])
      console.log(
        ` - ${i.name}: ${i.research_status}` +
          (i.overall_score != null ? ` ${i.overall_score}/100` : "") +
          (i.is_gated ? " [gated]" : ""),
      );
  }
}

main();
