import { useEffect, useState } from "react";
import { manifestUrl, type Manifest } from "./api";

export interface ArchiveState {
  data: Manifest | null;
  status: "loading" | "ready" | "error";
  error: string | null;
}

// Re-fetch the manifest every 10 minutes so a tab left open picks up the new
// day's chart once the daily ingestion has redeployed the site.
const REFRESH_MS = 10 * 60 * 1000;
const RETRY_MS = 5000;

export function useArchive(): ArchiveState {
  const [state, setState] = useState<ArchiveState>({
    data: null,
    status: "loading",
    error: null,
  });

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      let nextDelay = REFRESH_MS;
      try {
        const res = await fetch(manifestUrl(), { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Manifest;
        if (!alive) return;
        if (!Array.isArray(json.frames) || json.frames.length === 0) {
          throw new Error("archive is empty");
        }
        setState({ data: json, status: "ready", error: null });
      } catch (err) {
        if (!alive) return;
        // Keep showing the last good manifest if we already have one.
        setState((s) =>
          s.data
            ? s
            : { data: null, status: "error", error: String(err) },
        );
        nextDelay = RETRY_MS;
      }
      timer = setTimeout(poll, nextDelay);
    };

    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return state;
}
