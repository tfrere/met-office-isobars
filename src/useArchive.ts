import { useEffect, useState } from "react";
import { API_BASE, type ArchiveReady, type ArchiveResponse } from "./api";

interface State {
  data: ArchiveReady | null;
  status: ArchiveResponse["status"];
  error: string | null;
}

// While the archive is empty/syncing the backend returns
// `{ status: "building" }`; we poll until it is "ready", then refresh slowly to
// pick up the new day as the daily ingestion adds frames.
const POLL_BUILDING_MS = 3000;
const POLL_READY_MS = 10 * 60 * 1000;

export function useArchive(): State {
  const [state, setState] = useState<State>({
    data: null,
    status: "idle",
    error: null,
  });

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      let nextDelay = POLL_BUILDING_MS;
      try {
        const res = await fetch(`${API_BASE}/api/frames`);
        const json = (await res.json()) as ArchiveResponse;
        if (!alive) return;
        if (json.status === "ready") {
          setState({ data: json, status: "ready", error: null });
          nextDelay = POLL_READY_MS;
        } else {
          setState({
            data: null,
            status: json.status,
            error: json.error ?? null,
          });
        }
      } catch {
        if (!alive) return;
        setState((s) => ({ ...s, status: s.data ? "ready" : "building" }));
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
