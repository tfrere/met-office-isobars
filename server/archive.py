"""Met Office surface-pressure chart archive.

Fetches the daily *analysis* (T+0, observed state) surface-pressure chart from
the Met Office consumer API and stores it - one GIF per day - in a Hugging Face
dataset, so the archive keeps growing well past the ~7-day online retention of
the source. A small manifest lists the available dates; the frontend scrubs
through them on a timeline.

Source (undocumented, used by weather.metoffice.gov.uk):
    https://data.consumer-digital.api.metoffice.gov.uk/v1/surface-pressure/
        {variant}/{YYYY-MM-DD}T{run}/{run}_ASXX_Assistant_FC000.gif
We use the black-and-white ("bw") variant and prefer the 12:00 UTC run.

Persistence is best-effort: with a write-scoped ``HF_TOKEN`` the charts are
committed to the dataset (and re-synced on the next boot, surviving Space
rebuilds). Without a token the app still works, archiving locally for the
current session only.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import os
import re
from pathlib import Path

import httpx

# --- Configuration ----------------------------------------------------------

DATASET_REPO = os.environ.get("MET_OFFICE_DATASET", "tfrere/met-office-isobars-archive")
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")

VARIANT = "bw"  # "bw" (891x601) or "colour" (800x540)
# The Met Office issues two runs a day (07:30 and 19:30 UTC); the 12:00 run is
# the primary daily analysis. Fall back to the 00:00 run if the 12:00 chart is
# not published for a given day.
RUNS = ("1200", "0000")
# The source keeps roughly the last week of charts online; backfill that window
# on the first run so the archive starts with some depth.
BACKFILL_DAYS = 8
# Re-check for the freshly issued chart every few hours.
POLL_SECONDS = 6 * 60 * 60

BASE = "https://data.consumer-digital.api.metoffice.gov.uk/v1/surface-pressure"
SOURCE_LABEL = "Met Office · Surface Pressure Charts"
USER_AGENT = "met-office-isobars/1.0 (Hugging Face Space)"

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

DATA_DIR = Path(os.environ.get("ARCHIVE_DATA_DIR", str(Path(__file__).parent / "data")))
IMAGES_DIR = DATA_DIR / "images"
MANIFEST_PATH = DATA_DIR / "manifest.json"

# --- Module state shared with the API layer ---------------------------------

_state: dict = {"status": "idle", "error": None}
_manifest: dict | None = None
_task: asyncio.Task | None = None


# --- Manifest helpers --------------------------------------------------------


def _empty_manifest() -> dict:
    return {
        "source": SOURCE_LABEL,
        "variant": VARIANT,
        "run": RUNS[0],
        "frames": [],  # [{"date": "YYYY-MM-DD", "run": "1200"}], sorted ascending
        "updatedAt": "",
    }


def _load_manifest() -> dict:
    if MANIFEST_PATH.is_file():
        try:
            data = json.loads(MANIFEST_PATH.read_text())
            data.setdefault("frames", [])
            return data
        except (json.JSONDecodeError, ValueError):
            pass
    return _empty_manifest()


def _save_manifest(manifest: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))


# --- Met Office fetch --------------------------------------------------------


def _chart_url(date_iso: str, run: str) -> str:
    return f"{BASE}/{VARIANT}/{date_iso}T{run}/{run}_ASXX_Assistant_FC000.gif"


async def _fetch_day(
    client: httpx.AsyncClient, date_iso: str
) -> tuple[str, bytes] | None:
    """Return (run, gif_bytes) for the analysis chart on `date_iso`, or None."""
    for run in RUNS:
        try:
            resp = await client.get(
                _chart_url(date_iso, run), headers={"User-Agent": USER_AGENT}
            )
        except httpx.HTTPError:
            continue
        ctype = resp.headers.get("content-type", "")
        if resp.status_code == 200 and ctype.startswith("image") and resp.content:
            return run, resp.content
    return None


# --- Hugging Face dataset persistence (best-effort, blocking -> to_thread) ---


def _ensure_repo() -> None:
    from huggingface_hub import HfApi

    HfApi(token=HF_TOKEN).create_repo(
        DATASET_REPO, repo_type="dataset", exist_ok=True, private=False
    )


def _sync_from_dataset() -> None:
    """Mirror the existing archive (manifest + images) into DATA_DIR."""
    from huggingface_hub import snapshot_download

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=DATASET_REPO,
        repo_type="dataset",
        local_dir=str(DATA_DIR),
        token=HF_TOKEN,
    )


def _push(files: list[Path], message: str) -> None:
    from huggingface_hub import CommitOperationAdd, HfApi

    ops = [
        CommitOperationAdd(
            path_in_repo=str(p.relative_to(DATA_DIR)).replace(os.sep, "/"),
            path_or_fileobj=str(p),
        )
        for p in files
    ]
    HfApi(token=HF_TOKEN).create_commit(
        repo_id=DATASET_REPO,
        repo_type="dataset",
        operations=ops,
        commit_message=message,
    )


# --- Ingestion ---------------------------------------------------------------


async def ingest_once() -> None:
    """Fetch any missing charts in the recent window and persist new ones."""
    global _manifest
    manifest = _manifest if _manifest is not None else _load_manifest()
    have = {f["date"] for f in manifest["frames"]}

    today = dt.datetime.now(dt.timezone.utc).date()
    new_files: list[Path] = []
    new_frames: list[dict] = []

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        # Oldest -> newest so the dataset commit reads naturally.
        for offset in range(BACKFILL_DAYS, -1, -1):
            date_iso = (today - dt.timedelta(days=offset)).isoformat()
            if date_iso in have:
                continue
            result = await _fetch_day(client, date_iso)
            if result is None:
                continue
            run, content = result
            IMAGES_DIR.mkdir(parents=True, exist_ok=True)
            path = IMAGES_DIR / f"{date_iso}.gif"
            path.write_bytes(content)
            new_files.append(path)
            new_frames.append({"date": date_iso, "run": run})

    if new_frames:
        merged = {f["date"]: f for f in manifest["frames"]}
        for f in new_frames:
            merged[f["date"]] = f
        manifest["frames"] = [merged[k] for k in sorted(merged)]
        manifest["run"] = manifest["frames"][-1]["run"]
        manifest["updatedAt"] = dt.datetime.now(dt.timezone.utc).isoformat(
            timespec="seconds"
        )
        _save_manifest(manifest)

        if HF_TOKEN:
            span = (
                new_frames[0]["date"]
                if len(new_frames) == 1
                else f"{new_frames[0]['date']}..{new_frames[-1]['date']}"
            )
            try:
                await asyncio.to_thread(
                    _push, [MANIFEST_PATH, *new_files], f"add charts {span}"
                )
            except Exception as exc:  # noqa: BLE001
                print(f"[archive] dataset push failed (kept locally): {exc}")

    _manifest = manifest
    if manifest["frames"]:
        _state.update(status="ready", error=None)


# --- Background runner -------------------------------------------------------


async def _runner() -> None:
    global _manifest

    if HF_TOKEN:
        try:
            await asyncio.to_thread(_ensure_repo)
            await asyncio.to_thread(_sync_from_dataset)
        except Exception as exc:  # noqa: BLE001
            print(f"[archive] dataset sync skipped: {exc}")
    else:
        print("[archive] no HF_TOKEN: archiving locally for this session only")

    _manifest = _load_manifest()
    _state.update(status="ready" if _manifest["frames"] else "building")

    while True:
        try:
            await ingest_once()
        except Exception as exc:  # noqa: BLE001
            print(f"[archive] ingestion error: {exc}")
            if not (_manifest and _manifest["frames"]):
                _state.update(status="error", error=str(exc))
        await asyncio.sleep(POLL_SECONDS)


def start() -> None:
    global _task
    if _task is not None:
        return
    _task = asyncio.create_task(_runner())


# --- API surface -------------------------------------------------------------


def get_status_payload() -> dict:
    manifest = _manifest if _manifest is not None else _load_manifest()
    if _state["status"] == "ready" and manifest["frames"]:
        return {
            "status": "ready",
            "source": manifest["source"],
            "variant": manifest["variant"],
            "run": manifest.get("run", RUNS[0]),
            "dataset": DATASET_REPO if HF_TOKEN else None,
            "dates": [f["date"] for f in manifest["frames"]],
            "updatedAt": manifest.get("updatedAt", ""),
        }
    status = "building" if _state["status"] == "ready" else _state["status"]
    return {"status": status, "error": _state["error"]}


def image_path(date: str) -> Path | None:
    if not _DATE_RE.match(date):
        return None
    path = IMAGES_DIR / f"{date}.gif"
    return path if path.is_file() else None
