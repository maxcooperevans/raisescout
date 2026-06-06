"use client";

import { useState } from "react";

export interface ReviewItem {
  name: string;
  /** Present for web-discovered items; absent for founder-provided names. */
  reason?: string;
  source_url?: string;
}

const MAX_INVESTORS = 15;

function ItemRow({
  item,
  checked,
  onToggle,
}: {
  item: ReviewItem;
  checked: boolean;
  onToggle: () => void;
}) {
  const discovered = Boolean(item.source_url);
  return (
    <label className="flex cursor-pointer items-start gap-3 border-b border-zinc-100 px-3 py-2.5 hover:bg-zinc-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 h-4 w-4 shrink-0 accent-zinc-900"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="font-medium text-zinc-900">{item.name}</span>
          {!discovered && (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">
              yours
            </span>
          )}
        </span>
        {item.reason && (
          <span className="mt-0.5 block text-sm text-zinc-600">{item.reason}</span>
        )}
        {item.source_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 block truncate text-xs text-blue-600 underline decoration-dotted hover:text-blue-800"
          >
            {item.source_url}
          </a>
        )}
      </span>
    </label>
  );
}

export default function CandidateReview({
  investors,
  competitors,
  onConfirm,
  onBack,
  loading,
}: {
  investors: ReviewItem[];
  competitors: ReviewItem[] | null;
  onConfirm: (investorNames: string[], competitorNames: string[]) => void;
  onBack: () => void;
  loading: boolean;
}) {
  const [selInv, setSelInv] = useState<Set<string>>(
    () => new Set(investors.map((i) => i.name)),
  );
  const [selComp, setSelComp] = useState<Set<string>>(
    () => new Set((competitors ?? []).map((c) => c.name)),
  );

  const toggle = (
    set: React.Dispatch<React.SetStateAction<Set<string>>>,
    name: string,
  ) =>
    set((prev) => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });

  const invCount = selInv.size;
  const tooMany = invCount > MAX_INVESTORS;
  const canRun = invCount > 0 && !tooMany && !loading;

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Investors to score
          </h2>
          <span className={`text-xs ${tooMany ? "text-rose-600" : "text-zinc-400"}`}>
            {invCount} selected{tooMany ? ` · max ${MAX_INVESTORS}` : ""}
          </span>
        </div>
        {investors.length === 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No web-sourced candidates were found. Go back and paste names, or adjust
            the raise profile.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {investors.map((i) => (
              <ItemRow
                key={i.name}
                item={i}
                checked={selInv.has(i.name)}
                onToggle={() => toggle(setSelInv, i.name)}
              />
            ))}
          </div>
        )}
      </div>

      {competitors && competitors.length > 0 && (
        <div>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Confirm competitors
          </h2>
          <p className="mb-2 text-xs text-zinc-500">
            These feed the conflict gate (an investor backing one of these tanks its
            score). Confirm the real ones; uncheck anything that isn&rsquo;t a direct
            competitor.
          </p>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {competitors.map((c) => (
              <ItemRow
                key={c.name}
                item={c}
                checked={selComp.has(c.name)}
                onToggle={() => toggle(setSelComp, c.name)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          type="button"
          disabled={!canRun}
          onClick={() => onConfirm([...selInv], [...selComp])}
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {loading
            ? "Starting…"
            : `Research & score ${invCount} investor${invCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
