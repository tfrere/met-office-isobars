// Shared types + helpers for talking to the FastAPI backend.

export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface ArchiveReady {
  status: "ready";
  // Human-readable provenance string shown in the info tooltip.
  source: string;
  // "bw" (the only variant we archive for now).
  variant: string;
  // Dataset repo id the archive is persisted to (null if persistence is off).
  dataset: string | null;
  // Met Office model run the analysis charts come from ("1200" or "0000").
  run: string;
  // Available chart dates, ISO (YYYY-MM-DD), sorted oldest -> newest.
  dates: string[];
  // ISO timestamp of the last successful ingestion.
  updatedAt: string;
}

export interface ArchivePending {
  status: "idle" | "building" | "error";
  error: string | null;
}

export type ArchiveResponse = ArchiveReady | ArchivePending;

// URL of the chart image for a given date. Served as WebP (transcoded from the
// archived GIF) to keep the timeline light to scrub and play.
export function imageUrl(date: string): string {
  return `${API_BASE}/api/image/${date}.webp`;
}
