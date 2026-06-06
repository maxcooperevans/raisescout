import { NextResponse } from "next/server";
import { hasAccess } from "@/lib/auth";
import { createPendingInvestors, createRaise } from "@/lib/db";
import type { RaiseProfile } from "@/lib/types";

function parseRaise(input: unknown): RaiseProfile | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const raise: RaiseProfile = {
    company_name: str(r.company_name),
    stage: str(r.stage),
    sector: str(r.sector),
    round_size: str(r.round_size),
    geography: str(r.geography),
    thesis: str(r.thesis),
    competitors: Array.isArray(r.competitors)
      ? r.competitors.map((c) => String(c).trim()).filter(Boolean)
      : [],
  };
  // Minimal required fields for the agent to do useful work.
  if (!raise.company_name || !raise.stage || !raise.sector || !raise.thesis) {
    return null;
  }
  return raise;
}

export async function POST(req: Request) {
  if (!hasAccess(req)) {
    return NextResponse.json(
      { error: "Invalid or missing access password." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { raise: rawRaise, investors: rawInvestors } = (body ?? {}) as {
    raise?: unknown;
    investors?: unknown;
  };

  const raise = parseRaise(rawRaise);
  if (!raise) {
    return NextResponse.json(
      { error: "Missing required raise fields (company_name, stage, sector, thesis)." },
      { status: 400 },
    );
  }

  const investorNames = Array.isArray(rawInvestors)
    ? [...new Set(rawInvestors.map((n) => String(n).trim()).filter(Boolean))]
    : [];

  if (investorNames.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one investor name." },
      { status: 400 },
    );
  }
  if (investorNames.length > 15) {
    return NextResponse.json(
      { error: "v0 caps at 15 investors per run." },
      { status: 400 },
    );
  }

  try {
    // Just persist the raise + 'pending' investor rows and return immediately.
    // Each investor is researched by its own short request (see
    // /api/investors/[id]/research), driven and polled by the results page —
    // so no single request runs for minutes (deploy-friendly).
    const raiseId = await createRaise(raise);
    const idByName = await createPendingInvestors(raiseId, investorNames);
    const investorIds = investorNames
      .map((n) => idByName.get(n))
      .filter((id): id is string => Boolean(id));

    return NextResponse.json({ raiseId, investorIds });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
