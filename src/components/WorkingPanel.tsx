"use client";

import { useEffect, useState } from "react";

/**
 * Progress panel for long single-request work (discovery has no per-step events,
 * so the captions are time-based — but they honestly describe what the agent is
 * doing). Shows a spinner, an elapsed timer, and a rotating caption.
 */
export default function WorkingPanel({
  title,
  steps,
}: {
  title: string;
  steps: string[];
}) {
  const [secs, setSecs] = useState(0);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (steps.length <= 1) return;
    const t = setInterval(
      () => setStep((s) => Math.min(s + 1, steps.length - 1)),
      6000,
    );
    return () => clearInterval(t);
  }, [steps.length]);

  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, "0");

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-5 py-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600"
        />
        <span className="text-sm font-medium text-blue-900">{title}</span>
        <span className="ml-auto tabular-nums text-xs text-blue-500">
          {mm}:{ss}
        </span>
      </div>

      {steps.length > 0 && (
        <p className="mt-2 pl-7 text-sm text-blue-700">{steps[step]}</p>
      )}

      {/* Stepper dots */}
      {steps.length > 1 && (
        <div className="mt-2 flex gap-1.5 pl-7">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full ${
                i <= step ? "bg-blue-500" : "bg-blue-200"
              }`}
            />
          ))}
        </div>
      )}

      <p className="mt-2 pl-7 text-xs text-blue-400">
        Live web-search agent — usually under two minutes. Keep this tab open.
      </p>
    </div>
  );
}
