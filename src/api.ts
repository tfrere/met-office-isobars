// Shared types + helpers for the static archive served next to the app.
//
// There is no backend: `scripts/ingest.py` (run daily by GitHub Actions)
// writes `public/data/manifest.json` + `public/data/webp/<date>.webp`, which
// Vite copies verbatim into the build and GitHub Pages serves as static files.

// Vite's BASE_URL always ends with "/" ("/" locally, "/<repo>/" on Pages).
const DATA_BASE = `${import.meta.env.BASE_URL}data`;

export interface ManifestFrame {
  // ISO date (YYYY-MM-DD) of the analysis chart.
  date: string;
  // Met Office model run the chart comes from ("1200" or "0000").
  run: string;
}

export interface Manifest {
  // Human-readable provenance string shown in the info tooltip.
  source: string;
  // "bw" (the only variant we archive for now).
  variant: string;
  // Run of the most recent frame.
  run: string;
  // Available frames, sorted oldest -> newest.
  frames: ManifestFrame[];
  // ISO timestamp of the last successful ingestion.
  updatedAt: string;
}

export function manifestUrl(): string {
  // Cache-bust so a long-lived tab picks up the new day's chart; Pages sets
  // a 10-minute max-age on everything otherwise.
  return `${DATA_BASE}/manifest.json?t=${Date.now()}`;
}

// URL of the WebP chart for a given date.
export function imageUrl(date: string): string {
  return `${DATA_BASE}/webp/${date}.webp`;
}
