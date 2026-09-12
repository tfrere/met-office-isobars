# Met Office surface pressure charts, archived

Small web app that **archives, day after day**, the surface-pressure analysis
chart (isobars + fronts) published by the
[Met Office](https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure)
for Europe and the North-East Atlantic, and lets you **scrub through time**
with a timeline.

Live: **https://tfrere.github.io/met-office-isobars/**

The Met Office only keeps the last ~7 days online. A daily GitHub Actions cron
fetches the current chart and commits it to this repository, which therefore
grows into a long-term archive. There is no backend and no external storage:
**the git repo is the database, GitHub Pages is the server.**

## How it works

```
GitHub Actions cron (20:17 UTC)
  -> scripts/ingest.py
       fetches sources/<date>.gif from the Met Office
       writes  public/data/webp/<date>.webp (lighter, served to the browser)
       updates public/data/manifest.json
  -> git commit + push (built-in GITHUB_TOKEN, no secret to manage)
  -> .github/workflows/pages.yml : vite build -> deploy to GitHub Pages
```

- **Frontend**: Vite + React + TypeScript + MUI. Full-screen chart + timeline.
  Reads `data/manifest.json` and `data/webp/<date>.webp` as static files.
- **Ingest**: `scripts/ingest.py`, Python 3 + Pillow, stdlib HTTP.
- **Hosting**: GitHub Pages, deployed by `.github/workflows/pages.yml`.

| Path | Role |
| --- | --- |
| `sources/<YYYY-MM-DD>.gif` | Original Met Office GIF (source of truth, kept in git, not deployed). |
| `public/data/webp/<YYYY-MM-DD>.webp` | WebP transcode served by the site. |
| `public/data/manifest.json` | Available frames (`{date, run}`) + metadata. |

## Data source

Official "Surface Pressure Charts" from the Met Office (consumer API used by
their website):

```
https://data.consumer-digital.api.metoffice.gov.uk/v1/surface-pressure/
    bw/{YYYY-MM-DD}T1200/1200_ASXX_Assistant_FC000.gif
```

We archive the **analysis** chart (T+0, observed state) in **black & white**,
**12:00 UTC** run (falling back to the 00:00 run when missing).

(c) Crown copyright, Met Office. Reuse subject to their
[terms](https://www.metoffice.gov.uk/about-us/legal).

## Workflows

| Workflow | Trigger | Role |
| --- | --- | --- |
| `.github/workflows/ingest.yml` | daily cron (~20:17 UTC) + manual | Fetch today's chart, commit it, then call `pages.yml`. |
| `.github/workflows/pages.yml` | push on `main` + manual + called by ingest | Build the Vite app and deploy to GitHub Pages. |

Because the ingest job commits to the repo every day, GitHub's 60-day
inactivity auto-disable of scheduled workflows never triggers.

Pushes made with `GITHUB_TOKEN` do not fire `push` events, which is why
`ingest.yml` calls `pages.yml` explicitly (`workflow_call`) instead of relying
on the push trigger.

## Local development

```bash
# Frontend (port 5175). Serves public/data as static files, like Pages does.
npm install
npm run dev

# Fetch missing charts / rebuild the manifest by hand
pip install pillow
python scripts/ingest.py
python scripts/ingest.py --rebuild-webp   # re-encode every WebP from sources/
```

On macOS with a python.org interpreter you may need a CA bundle for urllib:
`SSL_CERT_FILE=$(python3 -m certifi) python scripts/ingest.py`.

## Production build

```bash
VITE_BASE=/met-office-isobars/ npm run build   # same as the Pages workflow
npm run preview
```
