"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RaiseForm, { type FormSubmission } from "@/components/RaiseForm";
import CandidateReview, { type ReviewItem } from "@/components/CandidateReview";
import WorkingPanel from "@/components/WorkingPanel";
import { loadHistory, saveHistory, type HistoryEntry } from "@/lib/history";
import type { RaiseProfile, SourcedSuggestion } from "@/lib/types";

type Phase = "form" | "working" | "review";

interface WorkInfo {
  title: string;
  steps: string[];
}

const DISCOVERY_WORK: WorkInfo = {
  title: "Discovering candidates from public sources…",
  steps: [
    "Searching VC sites, funding announcements and press…",
    "Verifying each candidate against a primary source…",
    "Discarding anything we can't source…",
    "Compiling the shortlist for your review…",
  ],
};

const CREATE_WORK: WorkInfo = {
  title: "Setting up your raise…",
  steps: ["Saving the raise and queueing investors for research…"],
};

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function RecentSearches({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Recent searches
      </h2>
      <div className="flex flex-col gap-1.5">
        {entries.map((e) => (
          <Link
            key={e.raiseId}
            href={`/raises/${e.raiseId}`}
            className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-2.5 shadow-sm hover:border-zinc-300 hover:bg-zinc-50"
          >
            <span className="min-w-0">
              <span className="block font-medium text-zinc-900">{e.company_name}</span>
              <span className="block text-xs text-zinc-500">
                {e.stage} · {e.sector} · {e.investor_count} investor
                {e.investor_count === 1 ? "" : "s"}
              </span>
            </span>
            <span className="ml-4 shrink-0 text-xs text-zinc-400">{timeAgo(e.created_at)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("form");
  const [work, setWork] = useState<WorkInfo>(DISCOVERY_WORK);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Carried from the form into the review step.
  const [raise, setRaise] = useState<RaiseProfile | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [reviewInvestors, setReviewInvestors] = useState<ReviewItem[]>([]);
  const [reviewCompetitors, setReviewCompetitors] = useState<ReviewItem[] | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  function fail(msg: string) {
    setError(msg);
    setPhase("form");
  }

  async function createAndGo(r: RaiseProfile, names: string[], key: string) {
    setWork(CREATE_WORK);
    setPhase("working");
    try {
      const res = await fetch("/api/raises", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-key": key },
        body: JSON.stringify({ raise: r, investors: names }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed.");
      try {
        sessionStorage.setItem(`rs_key_${data.raiseId}`, key);
      } catch { /* ignore */ }

      // Save to browser history so it shows in recent searches.
      saveHistory({
        raiseId: data.raiseId,
        company_name: r.company_name,
        stage: r.stage,
        sector: r.sector,
        investor_count: names.length,
      });

      router.push(`/raises/${data.raiseId}`);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  async function handleFormSubmit(s: FormSubmission) {
    setError(null);
    setAccessKey(s.accessKey);
    setRaise(s.raise);

    const needInvestors = s.mode !== "paste";
    const needCompetitors = s.raise.competitors.length === 0;

    if (!needInvestors && !needCompetitors) {
      await createAndGo(s.raise, s.names, s.accessKey);
      return;
    }

    setWork(DISCOVERY_WORK);
    setPhase("working");
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-key": s.accessKey },
        body: JSON.stringify({
          raise: s.raise,
          investors: needInvestors
            ? { mode: s.mode, seeds: s.mode === "seed" ? s.names : [] }
            : null,
          competitors: needCompetitors,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Discovery failed.");

      const discovered = (data.investors ?? []) as SourcedSuggestion[];
      const founderNames =
        s.mode === "seed" ? s.names : s.mode === "paste" ? s.names : [];
      const founderItems: ReviewItem[] = founderNames.map((name) => ({ name }));
      const lower = new Set(founderNames.map((n) => n.toLowerCase()));
      const discoveredItems: ReviewItem[] = discovered.filter(
        (d) => !lower.has(d.name.toLowerCase()),
      );

      setReviewInvestors([...founderItems, ...discoveredItems]);
      setReviewCompetitors(
        needCompetitors ? ((data.competitors ?? []) as SourcedSuggestion[]) : null,
      );
      setPhase("review");
    } catch (e) {
      fail(e instanceof Error ? e.message : "Discovery failed.");
    }
  }

  function handleConfirm(investorNames: string[], competitorNames: string[]) {
    if (!raise) return;
    const competitors =
      reviewCompetitors !== null ? competitorNames : raise.competitors;
    void createAndGo({ ...raise, competitors }, investorNames, accessKey);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <p className="text-sm text-zinc-500">
          Describe your raise. Paste investors or let RaiseScout discover real,
          web-sourced ones — then each is scored across six dimensions with cited
          evidence and given a draft first-touch you review before sending.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {phase === "form" && (
        <>
          <RecentSearches entries={history} />
          <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <RaiseForm onSubmit={handleFormSubmit} loading={false} />
          </section>
        </>
      )}

      {phase === "working" && (
        <WorkingPanel title={work.title} steps={work.steps} />
      )}

      {phase === "review" && (
        <section>
          <p className="mb-4 text-sm text-zinc-600">
            Every suggestion below is grounded in a public source — review and
            deselect any before scoring. The tool never scores names you
            haven&rsquo;t approved.
          </p>
          <CandidateReview
            investors={reviewInvestors}
            competitors={reviewCompetitors}
            onConfirm={handleConfirm}
            onBack={() => setPhase("form")}
            loading={false}
          />
        </section>
      )}
    </main>
  );
}
