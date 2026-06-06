import { NextResponse } from "next/server";
import { assessInvestor } from "@/lib/agent";
import { hasAccess } from "@/lib/auth";
import {
  claimInvestor,
  getInvestorRow,
  getRaiseProfile,
  saveAssessment,
} from "@/lib/db";

// One investor's full research+score+draft. ~150s typically — comfortably under
// a serverless function limit (set to 300s for headroom; needs Fluid Compute on
// Vercel). The whole batch never runs in a single request anymore.
export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasAccess(req)) {
    return NextResponse.json(
      { error: "Invalid or missing access password." },
      { status: 401 },
    );
  }

  const { id } = await params;

  try {
    const row = await getInvestorRow(id);
    if (!row) {
      return NextResponse.json({ error: "Investor not found." }, { status: 404 });
    }

    // Atomically claim the row. If we don't win it, it's already being
    // researched or finished — nothing to do, report current status.
    const claimed = await claimInvestor(id);
    if (!claimed) {
      return NextResponse.json({ id, status: row.research_status, skipped: true });
    }

    try {
      const raise = await getRaiseProfile(row.raise_id);
      const assessment = await assessInvestor(raise, row.name);
      await saveAssessment(id, {
        investor_name: row.name,
        assessment,
        error: null,
      });
      return NextResponse.json({ id, status: "complete" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Research failed.";
      await saveAssessment(id, {
        investor_name: row.name,
        assessment: null,
        error: message,
      });
      return NextResponse.json({ id, status: "error", error: message });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
