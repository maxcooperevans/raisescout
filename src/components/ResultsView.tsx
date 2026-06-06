"use client";

import { useEffect, useRef, useState } from "react";
import ResultsTable from "./ResultsTable";
import { generateCsv, downloadCsv } from "@/lib/csv";
import type { InvestorRecord } from "@/lib/types";

// How many investors to research at once from the browser, and how often to
// poll for updates. Concurrency is kept low because each research call drives a
// web-search agent against the shared Anthropic key (which rate-limits).
const CONCURRENCY = 3;
const POLL_MS = 3000;

export interface RaiseHeader {
  company_name: string;
  stage: string;
  sector: string;
  round_size: string;
  geography: string;
  thesis: string;
}

function isDone(s: string) {
  return s === "complete" || s === "error";
}

export default function ResultsView({
  raiseId,
  raise,
  initial,
}: {
  raiseId: string;
  raise: RaiseHeader;
  initial: InvestorRecord[];
}) {
  const [investors, setInvestors] = useState<InvestorRecord[]>(initial);
  const startedRef = useRef(false);

  const total = investors.length;
  const done = investors.filter((i) => isDone(i.research_status)).length;
  const errored = investors.filter((i) => i.research_status === "error").length;
  const allDone = total > 0 && done === total;
  const hasScored = investors.some((i) => i.research_status === "complete");

  useEffect(() => {
    // Guard against React 18/19 StrictMode double-invoke in dev.
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    // The access key was stashed by the form on the originating tab. Without it
    // (e.g. someone opened a shared results link), we don't trigger paid work —
    // we just poll and display whatever the creator's run produced.
    let accessKey = "";
    try {
      accessKey = sessionStorage.getItem(`rs_key_${raiseId}`) ?? "";
    } catch {
      /* sessionStorage unavailable */
    }

    // 1) Trigger research for any still-pending investors, bounded concurrency.
    //    The server claims each row atomically, so this is safe even if the
    //    page is reopened mid-run.
    const queue = accessKey
      ? initial.filter((i) => i.research_status === "pending").map((i) => i.id)
      : [];
    let qi = 0;
    async function worker() {
      while (qi < queue.length && !cancelled) {
        const id = queue[qi++];
        try {
          await fetch(`/api/investors/${id}/research`, {
            method: "POST",
            headers: { "x-access-key": accessKey },
          });
        } catch {
          // Network blip — polling still reflects server-side status/errors.
        }
      }
    }
    void Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
    );

    // 2) Poll the ranked results until everything is complete/errored.
    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch(`/api/raises/${raiseId}`, {
            cache: "no-store",
          });
          if (res.ok) {
            const data = await res.json();
            const inv = (data.investors ?? []) as InvestorRecord[];
            if (!cancelled) setInvestors(inv);
            if (inv.length > 0 && inv.every((i) => isDone(i.research_status))) {
              break;
            }
          }
        } catch {
          // keep polling
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    }
    void poll();

    return () => {
      cancelled = true;
    };
  }, [raiseId, initial]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          {raise.company_name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {raise.stage} · {raise.sector} · {raise.round_size} · {raise.geography}
        </p>
        <p className="mt-1 text-sm text-zinc-600">{raise.thesis}</p>
      </header>

      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Ranked shortlist · {total} investor{total === 1 ? "" : "s"}
        </h2>
        <div className="flex items-center gap-3">
          {!allDone ? (
            <span className="inline-flex items-center gap-2 text-sm text-blue-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              Researching… {done}/{total} done
            </span>
          ) : (
            <span className="text-sm text-zinc-500">
              Done{errored > 0 ? ` · ${errored} failed` : ""}
            </span>
          )}
          {hasScored && (
            <button
              onClick={() => {
                const slug = raise.company_name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "");
                downloadCsv(
                  generateCsv(investors),
                  `raisescout-${slug}.csv`,
                );
              }}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:border-zinc-400 hover:bg-zinc-50"
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      <ResultsTable investors={investors} />
      <p className="mt-3 text-xs text-zinc-400">
        Click a row to expand the per-dimension evidence and the draft intro.
        RaiseScout drafts outreach but never sends it. Results are served from the
        database — refresh-safe and shareable; research resumes if you reopen the
        page.
      </p>
    </main>
  );
}
