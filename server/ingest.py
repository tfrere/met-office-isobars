#!/usr/bin/env python3
"""One-shot Met Office chart ingestion, for an external scheduler.

Run by the GitHub Actions cron (``.github/workflows/ingest.yml``): it pulls the
existing archive from the Hugging Face dataset, fetches any missing recent
analysis charts, and commits the new ones back. This keeps the archive growing
even when the Space itself is asleep.

Requires ``HF_TOKEN`` (write) in the environment. Configuration is shared with
``archive.py`` (``MET_OFFICE_DATASET``, ...).
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import archive  # noqa: E402


def main() -> int:
    if not archive.HF_TOKEN:
        print("HF_TOKEN is required for cron ingestion", file=sys.stderr)
        return 1
    manifest = asyncio.run(archive.run_once())
    frames = manifest.get("frames", [])
    latest = frames[-1]["date"] if frames else "none"
    print(f"OK: {len(frames)} frames archived, latest = {latest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
