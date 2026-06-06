import { notFound } from "next/navigation";
import ResultsView from "@/components/ResultsView";
import { getRaise, getRankedInvestors } from "@/lib/db";
import type { InvestorRecord } from "@/lib/types";

// Always read fresh from the DB for the initial paint; the client view then
// polls for live updates as each investor completes.
export const dynamic = "force-dynamic";

export default async function RaiseResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let raise: Awaited<ReturnType<typeof getRaise>>;
  let investors: InvestorRecord[];
  try {
    [raise, investors] = await Promise.all([
      getRaise(id),
      getRankedInvestors(id),
    ]);
  } catch {
    notFound();
  }

  return (
    <ResultsView
      raiseId={id}
      raise={{
        company_name: raise.company_name,
        stage: raise.stage,
        sector: raise.sector,
        round_size: raise.round_size,
        geography: raise.geography,
        thesis: raise.thesis,
      }}
      initial={investors}
    />
  );
}
