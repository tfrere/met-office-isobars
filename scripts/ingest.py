#!/usr/bin/env python3
"""Fetch the daily Met Office surface-pressure analysis chart into the repo.

The git repository *is* the archive: this script is run by a GitHub Actions
cron, and whatever it writes gets committed back to `main` with the built-in
GITHUB_TOKEN. No external storage, no secrets to rotate.

Layout:
    sources/<YYYY-MM-DD>.gif            original Met Office GIF (source of truth,
                                        kept in git but not deployed)
    public/data/webp/<YYYY-MM-DD>.webp  lighter transcode served by the site
    public/data/manifest.json           list of available frames + metadata

Source (undocumented, used by weather.metoffice.gov.uk):
    https://data.consumer-digital.api.metoffice.gov.uk/v1/surface-pressure/
        {variant}/{YYYY-MM-DD}T{run}/{run}_ASXX_Assistant_FC000.gif
We archive the black-and-white ("bw") variant and prefer the 12:00 UTC run,
falling back to 00:00 when the noon chart is not published for a given day.

The Met Office only keeps roughly the last week online, so every run also
backfills any missing day in that window; a missed cron self-heals next day.

Usage:
    python scripts/ingest.py               # fetch missing charts, update webp/manifest
    python scripts/ingest.py --rebuild-webp  # re-transcode every WebP from sources/

Exit code is 0 when the archive is consistent (even if nothing new was fetched)
and 1 on a hard failure. The last line of output is `changed=true|false` so the
workflow knows whether there is anything to commit.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

# --- Configuration ----------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
SOURCES_DIR = ROOT / "sources"
PUBLIC_DATA_DIR = ROOT / "public" / "data"
WEBP_DIR = PUBLIC_DATA_DIR / "webp"
MANIFEST_PATH = PUBLIC_DATA_DIR / "manifest.json"

BASE = "https://data.consumer-digital.api.metoffice.gov.uk/v1/surface-pressure"
VARIANT = "bw"  # "bw" (891x601) or "colour" (800x540)
# Two runs a day; 12:00 UTC is the primary daily analysis.
RUNS = ("1200", "0000")
# The source keeps ~7 days online; re-check that whole window every run.
BACKFILL_DAYS = 8
SOURCE_LABEL = "Met Office · Surface Pressure Charts"
USER_AGENT = "met-office-isobars/2.0 (+https://github.com/tfrere/met-office-isobars)"
TIMEOUT_S = 30

# WebP quality: charts are black-and-white line art, 50 keeps them crisp while
# cutting weight ~4x versus the GIF.
WEBP_QUALITY = int(os.environ.get("WEBP_QUALITY", "50"))

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


# --- Manifest -----------------------------------------------------------------


def empty_manifest() -> dict:
    return {
        "source": SOURCE_LABEL,
        "variant": VARIANT,
        "run": RUNS[0],
        # [{"date": "YYYY-MM-DD", "run": "1200"}], sorted ascending
        "frames": [],
        "updatedAt": "",
    }


def load_manifest() -> dict:
    if MANIFEST_PATH.is_file():
        data = json.loads(MANIFEST_PATH.read_text())
        data.setdefault("frames", [])
        return data
    return empty_manifest()


def save_manifest(manifest: dict) -> None:
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n")


# --- Met Office fetch ---------------------------------------------------------


def chart_url(date_iso: str, run: str) -> str:
    return f"{BASE}/{VARIANT}/{date_iso}T{run}/{run}_ASXX_Assistant_FC000.gif"


def fetch_day(date_iso: str, runs: tuple[str, ...] = RUNS) -> tuple[str, bytes] | None:
    """Return (run, gif_bytes) for the analysis chart on `date_iso`, or None."""
    for run in runs:
        req = urllib.request.Request(
            chart_url(date_iso, run), headers={"User-Agent": USER_AGENT}
        )
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                ctype = resp.headers.get("Content-Type", "")
                body = resp.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                continue
            print(f"[ingest] {date_iso} {run}: HTTP {exc.code}", file=sys.stderr)
            continue
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            print(f"[ingest] {date_iso} {run}: {exc}", file=sys.stderr)
            continue
        if ctype.startswith("image") and body:
            return run, body
    return None


# --- WebP transcode -----------------------------------------------------------


def transcode(date_iso: str) -> bool:
    """Write public/data/webp/<date>.webp from sources/<date>.gif. Returns
    True if the file was (re)written."""
    src = SOURCES_DIR / f"{date_iso}.gif"
    if not src.is_file():
        print(f"[ingest] missing source for {date_iso}", file=sys.stderr)
        return False
    out = WEBP_DIR / f"{date_iso}.webp"
    WEBP_DIR.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        im.convert("RGB").save(out, "WEBP", quality=WEBP_QUALITY, method=6)
    return True


# --- Main ---------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--rebuild-webp",
        action="store_true",
        help="re-transcode every WebP from the GIF sources",
    )
    parser.add_argument(
        "--no-fetch",
        action="store_true",
        help="skip the Met Office fetch (only reconcile sources/webp/manifest)",
    )
    args = parser.parse_args()

    manifest = load_manifest()
    frames = {f["date"]: f for f in manifest["frames"] if _DATE_RE.match(f["date"])}
    changed = False

    # 1. Fetch any missing day in the recent window (oldest -> newest).
    if not args.no_fetch:
        today = dt.datetime.now(dt.timezone.utc).date()
        for offset in range(BACKFILL_DAYS, -1, -1):
            date_iso = (today - dt.timedelta(days=offset)).isoformat()
            if (SOURCES_DIR / f"{date_iso}.gif").is_file():
                continue
            # For today, only accept the primary 12:00 run: falling back to
            # 00:00 early in the day would lock in the wrong chart, since a
            # day is never re-fetched once archived. Past days take either.
            runs = RUNS[:1] if offset == 0 else RUNS
            result = fetch_day(date_iso, runs)
            if result is None:
                print(f"[ingest] {date_iso}: not available yet")
                continue
            run, content = result
            SOURCES_DIR.mkdir(parents=True, exist_ok=True)
            (SOURCES_DIR / f"{date_iso}.gif").write_bytes(content)
            frames[date_iso] = {"date": date_iso, "run": run}
            changed = True
            print(f"[ingest] {date_iso}: fetched run {run} ({len(content)} bytes)")

    # 2. Reconcile: every GIF in sources/ must have a manifest entry and a WebP.
    #    (Sources added by hand, e.g. a migration, get picked up here.)
    for src in sorted(SOURCES_DIR.glob("*.gif")):
        date_iso = src.stem
        if not _DATE_RE.match(date_iso):
            continue
        if date_iso not in frames:
            frames[date_iso] = {"date": date_iso, "run": RUNS[0]}
            changed = True
        # No mtime comparison here: a fresh git checkout gives every file the
        # same timestamp, which would cause spurious re-encodes in CI.
        if args.rebuild_webp or not (WEBP_DIR / f"{date_iso}.webp").is_file():
            if transcode(date_iso):
                changed = True
                print(f"[ingest] {date_iso}: webp written")

    # Drop manifest entries whose source vanished (should not happen, but keeps
    # the site from 404ing on a frame).
    for date_iso in list(frames):
        if not (SOURCES_DIR / f"{date_iso}.gif").is_file():
            del frames[date_iso]
            changed = True
            print(f"[ingest] {date_iso}: dropped (no source)", file=sys.stderr)

    # 3. Write the manifest if anything moved.
    if changed:
        manifest["source"] = SOURCE_LABEL
        manifest["variant"] = VARIANT
        manifest["frames"] = [frames[k] for k in sorted(frames)]
        manifest["run"] = manifest["frames"][-1]["run"] if manifest["frames"] else RUNS[0]
        manifest["updatedAt"] = dt.datetime.now(dt.timezone.utc).isoformat(
            timespec="seconds"
        )
        save_manifest(manifest)

    latest = manifest["frames"][-1]["date"] if manifest["frames"] else "none"
    print(f"OK: {len(manifest['frames'])} frames archived, latest = {latest}")
    print(f"changed={'true' if changed else 'false'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
