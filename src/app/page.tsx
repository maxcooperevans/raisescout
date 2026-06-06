"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RaiseForm, { type FormSubmission } from "@/components/RaiseForm";
import CandidateReview, { type ReviewItem } from "@/components/CandidateReview";
import WorkingPanel from "@/components/WorkingPanel";
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

export default function Home() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("form");
  const [work, setWork] = useState<WorkInfo>(DISCOVERY_WORK);
  const [error, setError] = useState<string | null>(null);

  // Carried from the form into the review step.
  const [raise, setRaise] = useState<RaiseProfile | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [reviewInvestors, setReviewInvestors] = useState<ReviewItem[]>([]);
  const [reviewCompetitors, setReviewCompetitors] = useState<ReviewItem[] | null>(
    null,
  );

  function fail(msg: string) {
    setError(msg);
    setPhase("form");
  }

  /** Create the raise (existing pipeline) and go to the live results page. */
  async function createAndGo(
    r: RaiseProfile,
    names: string[],
    key: string,
  ) {
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
      } catch {
        /* ignore */
      }
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

    // Paste + competitors given → straight into the existing pipeline.
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
      // Founder-provided seeds/pasted names appear as items without a source.
      const founderNames = needInvestors && s.mode === "seed" ? s.names : s.mode === "paste" ? s.names : [];
      const founderItems: ReviewItem[] = founderNames.map((name) => ({ name }));
      // Dedupe discovered against founder names (case-insensitive).
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
    // If competitors were discovered, use the confirmed set; otherwise keep the
    // founder's own competitors.
    const competitors =
      reviewCompetitors !== null ? competitorNames : raise.competitors;
    void createAndGo({ ...raise, competitors }, investorNames, accessKey);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">RaiseScout</h1>
        <p className="mt-1 text-sm text-zinc-500">
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
        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <RaiseForm onSubmit={handleFormSubmit} loading={false} />
        </section>
      )}

      {phase === "working" && (
        <WorkingPanel title={work.title} steps={work.steps} />
      )}

      {phase === "review" && (
        <section>
          <p className="mb-4 text-sm text-zinc-600">
            Every suggestion below is grounded in a public source — review and
            deselect any before scoring. The tool never scores names you haven&rsquo;t
            approved.
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
