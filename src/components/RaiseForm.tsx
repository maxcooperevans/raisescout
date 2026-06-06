"use client";

import { useState } from "react";
import type { RaiseProfile } from "@/lib/types";

export type InvestorMode = "paste" | "scratch" | "seed";

export interface FormSubmission {
  raise: RaiseProfile; // competitors parsed from the field (may be empty)
  mode: InvestorMode;
  /** Pasted names (paste mode) or seed names (seed mode); empty for scratch. */
  names: string[];
  accessKey: string;
}

interface FormValues extends RaiseProfile {
  investorsText: string;
}

const SAMPLE: FormValues = {
  company_name: "",
  stage: "",
  sector: "",
  round_size: "",
  geography: "",
  thesis: "",
  competitors: [],
  investorsText: "",
};

const inputCls =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";
const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500";

const MODES: { value: InvestorMode; label: string; hint: string }[] = [
  { value: "paste", label: "Paste my own", hint: "I'll provide the investor names." },
  {
    value: "scratch",
    label: "Suggest from scratch",
    hint: "Discover investors from my raise profile.",
  },
  {
    value: "seed",
    label: "Seed + expand",
    hint: "I'll give a few names; find more like them.",
  },
];

export default function RaiseForm({
  onSubmit,
  loading,
}: {
  onSubmit: (submission: FormSubmission) => void;
  loading: boolean;
}) {
  const [v, setV] = useState<FormValues>(SAMPLE);
  const [mode, setMode] = useState<InvestorMode>("scratch");
  const [accessKey, setAccessKey] = useState("");
  const set = (patch: Partial<FormValues>) =>
    setV((prev) => ({ ...prev, ...patch }));

  const competitorsProvided = v.competitors.length > 0;
  // Discovery is needed unless the founder pasted their own list AND gave competitors.
  const needsDiscovery = mode !== "paste" || !competitorsProvided;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const names =
      mode === "scratch"
        ? []
        : v.investorsText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
    const { investorsText: _omit, ...raise } = v;
    void _omit;
    onSubmit({ raise, mode, names, accessKey });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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
          <label className={labelCls}>Known competitors (optional)</label>
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
            placeholder="Leave blank to discover & confirm"
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

      {/* Investor input mode */}
      <div>
        <label className={labelCls}>Investors</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              type="button"
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                mode === m.value
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
              }`}
            >
              <span className="block font-medium">{m.label}</span>
              <span
                className={`block text-xs ${mode === m.value ? "text-zinc-300" : "text-zinc-400"}`}
              >
                {m.hint}
              </span>
            </button>
          ))}
        </div>

        {mode === "paste" && (
          <textarea
            className={`${inputCls} mt-2 h-28 resize-none font-mono`}
            value={v.investorsText}
            onChange={(e) => set({ investorsText: e.target.value })}
            placeholder={"One investor per line (max 15)"}
            required
          />
        )}
        {mode === "seed" && (
          <textarea
            className={`${inputCls} mt-2 h-20 resize-none font-mono`}
            value={v.investorsText}
            onChange={(e) => set({ investorsText: e.target.value })}
            placeholder={"2–3 investors you already like, one per line — we'll find more like them"}
            required
          />
        )}
        {mode === "scratch" && (
          <p className="mt-2 text-sm text-zinc-500">
            We&rsquo;ll propose real, web-sourced investors from your raise profile.
            You review and deselect before anything is scored.
          </p>
        )}
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
          Discovery and scoring call live agents (cost API credits), so new runs are
          gated. Viewing existing results is open.
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {loading
          ? "Working…"
          : needsDiscovery
            ? "Find candidates →"
            : "Research & score investors"}
      </button>
    </form>
  );
}
