import type { Confidence } from "./types";

/** Tailwind classes for an overall /100 fit score badge. */
export function scoreBadgeClasses(total: number, gated: boolean): string {
  if (gated) return "bg-zinc-200 text-zinc-600 border-zinc-300";
  if (total >= 75) return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (total >= 55) return "bg-lime-100 text-lime-800 border-lime-300";
  if (total >= 35) return "bg-amber-100 text-amber-800 border-amber-300";
  return "bg-rose-100 text-rose-800 border-rose-300";
}

/** Color for a single 0-5 dimension score. */
export function dimScoreClasses(score: number): string {
  if (score >= 4) return "bg-emerald-100 text-emerald-800";
  if (score >= 3) return "bg-lime-100 text-lime-800";
  if (score >= 2) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

export function confidenceClasses(c: Confidence): string {
  switch (c) {
    case "high":
      return "text-emerald-700";
    case "medium":
      return "text-amber-700";
    case "low":
      return "text-rose-700";
  }
}
