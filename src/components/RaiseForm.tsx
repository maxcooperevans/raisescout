"use client";

import { useState } from "react";
import type { RaiseProfile } from "@/lib/types";

export interface RaiseFormValues extends RaiseProfile {
  investorsText: string;
}

const SAMPLE: RaiseFormValues = {
  company_name: "Surveyr",
  stage: "Pre-seed",
  sector: "Proptech / B2B SaaS (property inspection software)",
  round_size: "£750k",
  geography: "UK",
  thesis:
    "AI-assisted property inspection software that turns a phone walkthrough into a structured surveyor-grade report.",
  competitors: ["GoReport", "Inventory Hive", "InventoryBase"],
  investorsText: "Seedcamp\nLocalGlobe\nForward Partners\nPi Labs\nSoftBank Vision Fund",
};

const inputCls =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";
const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500";

export default function RaiseForm({
  onSubmit,
  loading,
}: {
  onSubmit: (
    raise: RaiseProfile,
    investors: string[],
    accessKey: string,
  ) => void;
  loading: boolean;
}) {
  const [v, setV] = useState<RaiseFormValues>(SAMPLE);
  const [accessKey, setAccessKey] = useState("");
  const set = (patch: Partial<RaiseFormValues>) =>
    setV((prev) => ({ ...prev, ...patch }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const investors = v.investorsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const { investorsText: _omit, ...raise } = v;
    void _omit;
    onSubmit(raise, investors, accessKey);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Company</label>
          <input
            className={inputCls}
            value={v.company_name}
            onChange={(e) => set({ company_name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Stage</label>
          <input
            className={inputCls}
            value={v.stage}
            onChange={(e) => set({ stage: e.target.value })}
            placeholder="Pre-seed"
            required
          />
        </div>
        <div>
          <label className={labelCls}>Sector</label>
          <input
            className={inputCls}
            value={v.sector}
            onChange={(e) => set({ sector: e.target.value })}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Round size</label>
          <input
            className={inputCls}
            value={v.round_size}
            onChange={(e) => set({ round_size: e.target.value })}
            placeholder="£750k"
          />
        </div>
        <div>
          <label className={labelCls}>Geography</label>
          <input
            className={inputCls}
            value={v.geography}
            onChange={(e) => set({ geography: e.target.value })}
            placeholder="UK"
          />
        </div>
        <div>
          <label className={labelCls}>Known competitors (comma-separated)</label>
          <input
            className={inputCls}
            value={v.competitors.join(", ")}
            onChange={(e) =>
              set({
                competitors: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="Competitor A, Competitor B"
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>One-line thesis</label>
        <textarea
          className={`${inputCls} h-20 resize-none`}
          value={v.thesis}
          onChange={(e) => set({ thesis: e.target.value })}
          required
        />
      </div>

      <div>
        <label className={labelCls}>Investors (one per line, max 15)</label>
        <textarea
          className={`${inputCls} h-32 resize-none font-mono`}
          value={v.investorsText}
          onChange={(e) => set({ investorsText: e.target.value })}
          required
        />
      </div>

      <div>
        <label className={labelCls}>Access password</label>
        <input
          type="password"
          className={`${inputCls} max-w-xs`}
          value={accessKey}
          onChange={(e) => setAccessKey(e.target.value)}
          placeholder="required to run a new search"
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-zinc-400">
          Running a search calls a live research agent (costs API credits), so new
          runs are gated. Viewing existing results is open.
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {loading ? "Researching…" : "Research & score investors"}
      </button>
    </form>
  );
}
