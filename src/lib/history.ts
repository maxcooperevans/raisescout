/**
 * Browser-side raise history, stored in localStorage.
 * Kept deliberately light: just enough to render a clickable recent-searches list.
 */

const KEY = "rs_history";
const MAX = 10;

export interface HistoryEntry {
  raiseId: string;
  company_name: string;
  stage: string;
  sector: string;
  investor_count: number;
  created_at: string; // ISO
}

function read(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveHistory(entry: Omit<HistoryEntry, "created_at">) {
  try {
    const existing = read().filter((e) => e.raiseId !== entry.raiseId);
    const next: HistoryEntry[] = [
      { ...entry, created_at: new Date().toISOString() },
      ...existing,
    ].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* localStorage unavailable */
  }
}

export function loadHistory(): HistoryEntry[] {
  return read();
}
