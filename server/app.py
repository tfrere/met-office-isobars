"""Met Office surface-pressure archive - minimal FastAPI backend.

Runs the daily chart ingestion (see ``archive.py``) as a background task,
exposes the manifest + the archived GIFs, and serves the built Vite frontend.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import archive

app = FastAPI(title="Met Office Surface Pressure Archive", version="0.1.0")


@app.get("/api/frames")
async def frames() -> dict:
    return archive.get_status_payload()


@app.get("/api/image/{date}.gif")
async def image(date: str) -> FileResponse:
    path = archive.image_path(date)
    if path is None:
        raise HTTPException(status_code=404, detail="chart not found")
    return FileResponse(path, media_type="image/gif")


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.on_event("startup")
async def _startup() -> None:
    archive.start()


# --- Static frontend (Vite build output) ---

_DIST = Path(__file__).parent / "static"
if _DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/")
    async def index() -> FileResponse:
        return FileResponse(_DIST / "index.html")

    @app.get("/{path:path}")
    async def spa_fallback(path: str) -> FileResponse:
        candidate = _DIST / path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_DIST / "index.html")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "7860"))
    uvicorn.run(app, host="0.0.0.0", port=port)
