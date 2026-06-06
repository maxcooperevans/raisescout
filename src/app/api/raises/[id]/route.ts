import { NextResponse } from "next/server";
import { getRaise, getRankedInvestors } from "@/lib/db";

/** Fetch a previously-run raise + its ranked investors (proves persistence). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const [raise, investors] = await Promise.all([
      getRaise(id),
      getRankedInvestors(id),
    ]);
    return NextResponse.json({ raiseId: id, raise, investors });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
