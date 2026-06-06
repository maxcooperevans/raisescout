/**
 * Client-side CSV export for the ranked investor shortlist.
 *
 * Columns (left to right):
 *   Rank, Firm, Overall Score, Gated, Gate Reason,
 *   Stage Fit, Sector Fit, Conflict Risk, Check Size Fit, Geography, Recent Activity,
 *   Contact URL, Typical Check, Sectors, Geographies
 *
 * "Contact method" and "approach preference" aren't structured fields in the
 * current enrichment model — contact URL uses enrichment.website as the closest
 * proxy. The rest are included from what the research phase returns.
 *
 * Commas, quotes, and newlines inside any field are RFC 4180 escaped.
 */

import { DIMENSION_ORDER, DIMENSION_LABELS } from "./scoring";
import type { InvestorRecord } from "./types";

function esc(value: string): string {
  // Wrap in double-quotes if the field contains any special characters.
  // Internal double-quotes are doubled per RFC 4180.
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const HEADERS: string[] = [
  "Rank",
  "Firm",
  "Overall Score",
  "Gated",
  "Gate Reason",
  ...DIMENSION_ORDER.map((d) => DIMENSION_LABELS[d]),
  "Contact URL",
  "Typical Check",
  "Sectors",
  "Geographies",
];

/**
 * Convert the ranked investor list to a CSV string.
 * Investors are expected pre-ranked (index + 1 = rank).
 * Incomplete/still-researching rows are included with empty score fields.
 */
export function generateCsv(investors: InvestorRecord[]): string {
  const rows: string[] = [HEADERS.map(esc).join(",")];

  investors.forEach((inv, idx) => {
    const rank = idx + 1;
    const score = inv.score;
    const enrich = inv.enrichment;

    // Per-dimension scores keyed by dimension name.
    const dimMap = new Map(
      (score?.dimensions ?? []).map((d) => [d.dimension, d.score]),
    );

    const fields: string[] = [
      String(rank),
      inv.name,
      inv.overall_score !== null ? String(inv.overall_score) : "",
      inv.is_gated ? "Yes" : score ? "No" : "",
      score?.gate_reason ?? "",
      // Six dimension scores in DIMENSION_ORDER sequence.
      ...DIMENSION_ORDER.map((dim) => {
        const s = dimMap.get(dim);
        return s !== undefined ? String(s) : "";
      }),
      enrich?.website ?? "",
      enrich?.typical_check ?? "",
      enrich ? enrich.sectors.join("; ") : "",
      enrich ? enrich.geographies.join("; ") : "",
    ];

    rows.push(fields.map(esc).join(","));
  });

  return rows.join("\r\n");
}

/** Trigger a file-save dialog in the browser for the given CSV string. */
export function downloadCsv(csv: string, filename: string): void {
  // UTF-8 BOM so Excel auto-detects encoding without a wizard.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
