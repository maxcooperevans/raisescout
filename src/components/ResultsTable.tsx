"use client";

import { Fragment, useState } from "react";
import { DIMENSION_LABELS, DIMENSION_ORDER } from "@/lib/scoring";
import {
  confidenceClasses,
  dimScoreClasses,
  scoreBadgeClasses,
} from "@/lib/ui";
import type { Dimension, InvestorRecord } from "@/lib/types";

function DimensionRow({
  dim,
  record,
}: {
  dim: Dimension;
  record: InvestorRecord;
}) {
  const d = record.score?.dimensions.find((x) => x.dimension === dim);
  if (!d) return null;
  return (
    <div className="grid grid-cols-[140px_44px_1fr] items-start gap-3 py-2">
      <div className="text-sm font-medium text-zinc-700">
        {DIMENSION_LABELS[dim]}
      </div>
      <div
        className={`flex h-7 w-9 items-center justify-center rounded text-sm font-semibold ${dimScoreClasses(
          d.score,
        )}`}
        title={`${d.score}/5, weight ${d.weight}`}
      >
        {d.score}
      </div>
      <div className="text-sm text-zinc-600">
        <p>{d.evidence}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs">
          <span className={confidenceClasses(d.confidence)}>
            confidence: {d.confidence}
          </span>
          {d.source_url ? (
            <a
              href={d.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline decoration-dotted hover:text-blue-800 break-all"
            >
              source
            </a>
          ) : (
            <span className="text-zinc-400">no source</span>
          )}
        </p>
      </div>
    </div>
  );
}

function ExpandedDetail({ record }: { record: InvestorRecord }) {
  const e = record.enrichment;
  return (
    <td colSpan={4} className="bg-zinc-50 px-4 py-4">
      {record.research_status === "error" ? (
        <p className="text-sm text-rose-700">
          Research failed: {record.error}
        </p>
      ) : record.research_status !== "complete" ? (
        <p className="text-sm text-blue-700">
          {record.research_status === "researching"
            ? "Researching from public sources…"
            : "Queued for research…"}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* Scoring evidence */}
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Fit breakdown
            </h4>
            {record.score?.gate_reason && (
              <p className="mb-2 rounded bg-zinc-200 px-2 py-1 text-xs text-zinc-700">
                ⚠ Gated — {record.score.gate_reason}
              </p>
            )}
            <div className="divide-y divide-zinc-200">
              {DIMENSION_ORDER.map((dim) => (
                <DimensionRow key={dim} dim={dim} record={record} />
              ))}
            </div>
            {e && (
              <p className="mt-3 text-xs text-zinc-500">
                {e.stages.length > 0 && <>Stages: {e.stages.join(", ")} · </>}
                {e.typical_check && <>Check: {e.typical_check} · </>}
                {e.sources.length} sources consulted
              </p>
            )}
          </div>

          {/* Draft intro */}
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Draft first-touch{" "}
              <span className="font-normal text-zinc-400">(review before sending)</span>
            </h4>
            {record.draft_intro ? (
              <pre className="whitespace-pre-wrap rounded border border-zinc-200 bg-white p-3 text-sm text-zinc-700">
                {record.draft_intro}
              </pre>
            ) : (
              <p className="text-sm text-zinc-400">
                No draft — investor is gated / not a fit.
              </p>
            )}
          </div>
        </div>
      )}
    </td>
  );
}

export default function ResultsTable({
  investors,
}: {
  investors: InvestorRecord[];
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <th className="w-12 px-4 py-3">#</th>
            <th className="px-4 py-3">Investor</th>
            <th className="w-28 px-4 py-3">Fit</th>
            <th className="px-4 py-3">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {investors.map((inv, i) => {
            const isOpen = open.has(inv.id);
            const total = inv.overall_score;
            return (
              <Fragment key={inv.id}>
                <tr
                  onClick={() => toggle(inv.id)}
                  className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50"
                >
                  <td className="px-4 py-3 text-sm text-zinc-400">{i + 1}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-zinc-900">{inv.name}</span>
                    {inv.research_status === "error" && (
                      <span className="ml-2 text-xs text-rose-600">failed</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {total != null ? (
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-semibold ${scoreBadgeClasses(
                          total,
                          inv.is_gated,
                        )}`}
                      >
                        {total}
                        {inv.is_gated && (
                          <span className="ml-1 text-[10px] uppercase">gated</span>
                        )}
                      </span>
                    ) : inv.research_status === "researching" ||
                      inv.research_status === "pending" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-blue-600">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                        {inv.research_status === "researching"
                          ? "researching"
                          : "queued"}
                      </span>
                    ) : (
                      <span className="text-sm text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600">
                    <div className="flex items-center justify-between gap-2">
                      <span className="line-clamp-2">
                        {inv.score?.summary ??
                          (inv.research_status === "error"
                            ? "Research failed"
                            : inv.research_status === "complete"
                              ? "—"
                              : "Researching from public sources…")}
                      </span>
                      <span className="shrink-0 text-zinc-400">
                        {isOpen ? "▲" : "▼"}
                      </span>
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <ExpandedDetail record={inv} />
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
