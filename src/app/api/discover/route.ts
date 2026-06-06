import { NextResponse } from "next/server";
import { discoverCompetitors, discoverInvestors } from "@/lib/agent/discover";
import { hasAccess } from "@/lib/auth";
import type { RaiseProfile } from "@/lib/types";

// Discovery runs web searches (spends credits), so it's gated like the other
// paid endpoints. ~40-90s; fine on a persistent server.
export const maxDuration = 300;

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

  const {
    raise: rawRaise,
    investors,
    competitors,
  } = (body ?? {}) as {
    raise?: unknown;
    investors?: { mode?: string; seeds?: unknown } | null;
    competitors?: boolean;
  };

  const raise = parseRaise(rawRaise);
  if (!raise) {
    return NextResponse.json(
      { error: "Missing required raise fields (company_name, stage, sector, thesis)." },
      { status: 400 },
    );
  }

  const wantInvestors = investors?.mode === "scratch" || investors?.mode === "seed";
  const seeds =
    investors?.mode === "seed" && Array.isArray(investors.seeds)
      ? investors.seeds.map((s) => String(s).trim()).filter(Boolean)
      : [];

  if (!wantInvestors && !competitors) {
    return NextResponse.json(
      { error: "Nothing to discover (no investor mode and competitors not requested)." },
      { status: 400 },
    );
  }

  try {
    const [inv, comp] = await Promise.all([
      wantInvestors ? discoverInvestors(raise, { seeds, limit: 12 }) : null,
      competitors ? discoverCompetitors(raise) : null,
    ]);

    return NextResponse.json({
      investors: inv?.suggestions ?? null,
      competitors: comp?.suggestions ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Discovery failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
